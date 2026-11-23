import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig } from '../config.js'
import { seedDatabase, seedIds } from '../db/seed.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { createS3Storage, type ObjectStorage } from './storage.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'

// The spot sits at 35.6812, 139.7671; 0.00027° of latitude is about 30 m.
const spotPoint = { lat: 35.6812, lng: 139.7671 }
const near = { lat: 35.68147, lng: 139.7671 }
const farAway = { lat: 35.6992, lng: 139.7671 }

describe('photobook photos', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let storage: ObjectStorage
  let png: Buffer

  beforeAll(async () => {
    db = await createTestDatabase()
    const config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
      S3_BUCKET: 'tripboard-photos-test',
    })
    storage = createS3Storage(config)
    png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 200, g: 20, b: 20 },
      },
    })
      .png()
      .toBuffer()
    app = await buildApp(db.pool, {
      config,
      now: () => new Date('2026-06-01T00:00:00.000Z'),
      storage,
    })
  })

  afterAll(async () => {
    await app.close()
    const keys = await storage.list().catch(() => [])
    await Promise.all(keys.map((key) => storage.delete(key)))
    await db.pool.end()
    await db.drop()
  })

  beforeEach(async () => {
    await db.pool.query(`
      DELETE FROM plan_entry_spots;
      DELETE FROM images;
      DELETE FROM plan_entries;
      DELETE FROM spots;
      DELETE FROM trip_invites;
      DELETE FROM trip_members;
      DELETE FROM trips;
      DELETE FROM activity_events;
      DELETE FROM blob_deletions;
      DELETE FROM sessions;
      DELETE FROM users;
      UPDATE app_settings
      SET uploads_enabled = true,
          default_max_images = 100,
          default_max_bytes = 209715200;
    `)
    const keys = await storage.list()
    await Promise.all(keys.map((key) => storage.delete(key)))
  })

  it('T-47-02 links a photo 30 m from a spot, keeps its point and strips EXIF', async () => {
    const owner = await login('100000000000000471')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId, 'Temple', spotPoint)
    const jpeg = await jpegWithGps()
    expect((await sharp(jpeg).metadata()).exif).toBeDefined()

    const created = await uploadPhoto(owner.cookie, tripId, jpeg, {
      ...near,
      takenAt: '2026-04-13T10:15:00',
      caption: 'From the gate',
    })
    expect(created.statusCode).toBe(201)
    const photo = created.json()
    expect(photo).toMatchObject({
      tripId,
      spotId,
      spotTitle: 'Temple',
      lat: near.lat,
      lng: near.lng,
      takenAt: '2026-04-13T10:15:00',
      placeSource: 'exif',
      caption: 'From the gate',
      width: 2048,
      height: 1536,
      uploadedBy: { id: owner.user.id },
    })
    expect(photo.url).toContain(`/images/${photo.id}/file?exp=`)

    const row = await db.pool.query<{
      storage_key: string
      spot_id: string
      place_source: string
      taken_at: string
    }>(
      `SELECT storage_key, spot_id, place_source,
         to_char(taken_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS taken_at
       FROM images WHERE id = $1`,
      [photo.id],
    )
    expect(row.rows[0]).toMatchObject({
      spot_id: spotId,
      place_source: 'exif',
      taken_at: '2026-04-13T10:15:00',
    })
    expect(row.rows[0]?.storage_key).toMatch(
      new RegExp(`^trips/${tripId}/photos/.+\\.webp$`),
    )
    const stored = await sharp(
      await storage.get(row.rows[0]!.storage_key),
    ).metadata()
    expect(stored.format).toBe('webp')
    expect(stored.exif).toBeUndefined()

    const events = await db.pool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM activity_events WHERE action = 'image.upload'`,
    )
    expect(events.rows).toHaveLength(1)
    expect(events.rows[0]?.metadata).toEqual({
      source: 'photobook',
      spot: 'Temple',
      bytes: photo.bytes,
    })
  })

  it('T-47-02 leaves a photo 2 km away, or without a point, unlinked', async () => {
    const owner = await login('100000000000000472')
    const tripId = await createTrip(owner.cookie)
    await createSpot(owner.cookie, tripId, 'Temple', spotPoint)

    const far = await uploadPhoto(owner.cookie, tripId, png, farAway)
    expect(far.statusCode).toBe(201)
    expect(far.json()).toMatchObject({
      spotId: null,
      spotTitle: null,
      lat: farAway.lat,
      placeSource: 'exif',
    })

    const none = await uploadPhoto(owner.cookie, tripId, png, {})
    expect(none.statusCode).toBe(201)
    expect(none.json()).toMatchObject({
      spotId: null,
      lat: null,
      lng: null,
      takenAt: null,
      placeSource: null,
      caption: null,
    })
    // An empty field counts as absent.
    const empty = await uploadPhoto(owner.cookie, tripId, png, {
      lat: '',
      lng: '',
      takenAt: '',
    })
    expect(empty.statusCode).toBe(201)
    expect(empty.json()).toMatchObject({ lat: null, takenAt: null })
  })

  it('T-47-02 names the spot that wins over the nearest one', async () => {
    const owner = await login('100000000000000473')
    const tripId = await createTrip(owner.cookie)
    await createSpot(owner.cookie, tripId, 'Temple', spotPoint)
    const other = await createSpot(owner.cookie, tripId, 'Cafe', farAway)
    const response = await uploadPhoto(owner.cookie, tripId, png, {
      ...near,
      spotId: other,
    })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ spotId: other, lat: near.lat })
  })

  it('T-47-02 rejects bad fields with 400 and stores nothing', async () => {
    const owner = await login('100000000000000474')
    const tripId = await createTrip(owner.cookie)

    const onlyLat = await uploadPhoto(owner.cookie, tripId, png, { lat: 35.6 })
    expect(onlyLat.statusCode).toBe(400)
    expect(onlyLat.json()).toEqual({
      error: 'invalid_request',
      fields: { lng: 'both_or_none' },
    })
    const onlyLng = await uploadPhoto(owner.cookie, tripId, png, { lng: 139 })
    expect(onlyLng.json().fields).toEqual({ lat: 'both_or_none' })

    const yesterday = await uploadPhoto(owner.cookie, tripId, png, {
      takenAt: 'yesterday',
    })
    expect(yesterday.statusCode).toBe(400)
    expect(yesterday.json().fields).toEqual({ takenAt: 'invalid' })

    const range = await uploadPhoto(owner.cookie, tripId, png, {
      lat: 91,
      lng: 10,
    })
    expect(range.statusCode).toBe(400)
    expect(range.json().fields).toEqual({ lat: 'invalid' })

    expect(await imageCount()).toBe(0)
    expect(await storage.list()).toEqual([])
  })

  it('T-47-02 answers 404 for a spot of another trip, 403 for a visitor, 404 for a stranger, 401 without a session', async () => {
    const owner = await login('100000000000000475')
    const tripId = await createTrip(owner.cookie)
    const otherTrip = await createTrip(owner.cookie)
    const foreignSpot = await createSpot(
      owner.cookie,
      otherTrip,
      'Elsewhere',
      spotPoint,
    )

    const foreign = await uploadPhoto(owner.cookie, tripId, png, {
      spotId: foreignSpot,
    })
    expect(foreign.statusCode).toBe(404)
    const unknown = await uploadPhoto(owner.cookie, tripId, png, {
      spotId: '99999999-9999-4999-8999-999999999999',
    })
    expect(unknown.statusCode).toBe(404)
    expect(await imageCount()).toBe(0)
    expect(await storage.list()).toEqual([])

    const visitor = await login('100000000000000476')
    await addMember(tripId, visitor.user.id, 'visitor')
    expect(
      (await uploadPhoto(visitor.cookie, tripId, png, {})).statusCode,
    ).toBe(403)
    const stranger = await login('100000000000000477')
    expect(
      (await uploadPhoto(stranger.cookie, tripId, png, {})).statusCode,
    ).toBe(404)
    expect(
      (
        await uploadPhoto(
          owner.cookie,
          '99999999-9999-4999-8999-999999999999',
          png,
          {},
        )
      ).statusCode,
    ).toBe(404)
    expect((await uploadPhoto('', tripId, png, {})).statusCode).toBe(401)
  })

  it('T-47-02 returns 413 quota_exceeded over the quota and keeps the pipeline codes', async () => {
    const owner = await login('100000000000000478')
    await db.pool.query('UPDATE users SET max_images = 1 WHERE id = $1', [
      owner.user.id,
    ])
    const tripId = await createTrip(owner.cookie)
    expect((await uploadPhoto(owner.cookie, tripId, png, {})).statusCode).toBe(
      201,
    )
    const second = await uploadPhoto(owner.cookie, tripId, png, {})
    expect(second.statusCode).toBe(413)
    expect(second.json()).toMatchObject({
      error: 'quota_exceeded',
      usedImages: 1,
      maxImages: 1,
    })

    const pdf = await uploadPhoto(
      owner.cookie,
      tripId,
      Buffer.from('%PDF-1.4\nnot an image'),
      {},
    )
    expect(pdf.statusCode).toBe(415)
    const huge = Buffer.alloc(11 * 1024 * 1024, 0)
    huge[0] = 0xff
    huge[1] = 0xd8
    huge[2] = 0xff
    const tooBig = await uploadPhoto(owner.cookie, tripId, huge, {})
    expect(tooBig.statusCode).toBe(413)
    expect(tooBig.json()).toEqual({
      error: 'too_large',
      maxFileBytes: 10 * 1024 * 1024,
    })

    await db.pool.query('UPDATE app_settings SET uploads_enabled = false')
    const paused = await uploadPhoto(owner.cookie, tripId, png, {})
    expect(paused.statusCode).toBe(503)
    expect(paused.json()).toMatchObject({ error: 'uploads_paused' })
    expect(await imageCount()).toBe(1)
  })

  it('T-47-03 lists gallery and photobook photos of the seed, undated last', async () => {
    await seedDatabase(db.pool)
    const sven = await login('100000000000000001')
    const gallery = await upload(sven.cookie, seedIds.spots.fushimi, png)
    expect(gallery.statusCode).toBe(201)
    const galleryId = gallery.json().id as string

    const response = await app.inject({
      method: 'GET',
      url: `/trips/${seedIds.trip}/photos`,
      headers: { cookie: sven.cookie },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.uploadsEnabled).toBe(true)
    const photos = body.photos as Array<Record<string, unknown>>
    expect(photos.map((photo) => photo.id)).toEqual([
      seedIds.photos.crossing,
      seedIds.photos.alley,
      seedIds.photos.kamo,
      seedIds.photos.unplaced,
      galleryId,
    ])
    expect(photos[0]).toMatchObject({
      spotId: seedIds.spots.shibuya,
      spotTitle: 'Shibuya Sky',
      lat: 35.6582,
      lng: 139.7022,
      takenAt: '2026-04-13T10:15:00',
      placeSource: 'exif',
      caption: 'Crossing from above',
      uploadedBy: { id: seedIds.users.aiko, name: 'Aiko' },
    })
    expect(photos[3]).toMatchObject({ lat: null, lng: null, spotId: null })
    // A gallery photo carries its spot's point and no time.
    expect(photos[4]).toMatchObject({
      spotId: seedIds.spots.fushimi,
      lat: 34.967,
      lng: 135.772,
      takenAt: null,
      placeSource: null,
    })
    for (const photo of photos) {
      expect(photo.url).toMatch(/\/images\/.+\/file\?exp=\d+&sig=.+/)
    }
    const file = await app.inject({
      method: 'GET',
      url: photos[4]!.url as string,
    })
    expect(file.statusCode).toBe(200)

    // R-47-11: the linked photobook photo is in the spot's gallery too.
    const spotGallery = await app.inject({
      method: 'GET',
      url: `/spots/${seedIds.spots.shibuya}/images`,
      headers: { cookie: sven.cookie },
    })
    expect(spotGallery.statusCode).toBe(200)
    expect(spotGallery.json().images).toEqual([
      expect.objectContaining({
        id: seedIds.photos.crossing,
        spotId: seedIds.spots.shibuya,
        lat: 35.6582,
        takenAt: '2026-04-13T10:15:00',
        caption: 'Crossing from above',
      }),
    ])
    const single = await app.inject({
      method: 'GET',
      url: `/images/${seedIds.photos.alley}`,
      headers: { cookie: sven.cookie },
    })
    expect(single.json()).toMatchObject({ spotId: null, lat: 35.6655 })
  })

  it('T-47-03 hides the list from a non-member and needs a session', async () => {
    const owner = await login('100000000000000479')
    const tripId = await createTrip(owner.cookie)
    const visitor = await login('100000000000000480')
    await addMember(tripId, visitor.user.id, 'visitor')
    const stranger = await login('100000000000000481')
    const get = (cookie: string, id = tripId) =>
      app.inject({
        method: 'GET',
        url: `/trips/${id}/photos`,
        headers: cookie ? { cookie } : {},
      })
    expect((await get(visitor.cookie)).statusCode).toBe(200)
    expect((await get(stranger.cookie)).statusCode).toBe(404)
    expect(
      (await get(owner.cookie, '99999999-9999-4999-8999-999999999999'))
        .statusCode,
    ).toBe(404)
    expect((await get('')).statusCode).toBe(401)
  })

  it('T-47-04 places a photo by point, lets a named spot win and records image.update', async () => {
    const owner = await login('100000000000000482')
    const tripId = await createTrip(owner.cookie)
    const temple = await createSpot(owner.cookie, tripId, 'Temple', spotPoint)
    const cafe = await createSpot(owner.cookie, tripId, 'Cafe', farAway)
    const created = await uploadPhoto(owner.cookie, tripId, png, {})
    const id = created.json().id as string
    expect(created.json()).toMatchObject({ lat: null, spotId: null })

    const placed = await patch(owner.cookie, id, near)
    expect(placed.statusCode).toBe(200)
    expect(placed.json()).toMatchObject({
      id,
      lat: near.lat,
      lng: near.lng,
      spotId: temple,
      spotTitle: 'Temple',
      placeSource: 'manual',
    })
    const events = await db.pool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM activity_events WHERE action = 'image.update'`,
    )
    expect(events.rows).toHaveLength(1)
    expect(events.rows[0]?.metadata).toEqual({
      fields: ['lat', 'lng'],
      spot: 'Temple',
    })

    const named = await patch(owner.cookie, id, { ...near, spotId: cafe })
    expect(named.json()).toMatchObject({ spotId: cafe, lat: near.lat })
    const moved = await patch(owner.cookie, id, farAway)
    expect(moved.json()).toMatchObject({ spotId: cafe, lat: farAway.lat })
    const alone = await patch(owner.cookie, id, { spotId: temple })
    expect(alone.json()).toMatchObject({
      spotId: temple,
      lat: farAway.lat,
      placeSource: 'manual',
    })
    // A point without a spot near it unlinks the photo.
    const lonely = await patch(owner.cookie, id, { lat: 10, lng: 10 })
    expect(lonely.json()).toMatchObject({ spotId: null, lat: 10 })
  })

  it('T-47-04 captions, clears, and refuses to lose a photo from map and galleries', async () => {
    const owner = await login('100000000000000483')
    const tripId = await createTrip(owner.cookie)
    const temple = await createSpot(owner.cookie, tripId, 'Temple', spotPoint)
    const unplaced = (await uploadPhoto(owner.cookie, tripId, png, {})).json()
      .id as string
    const gallery = (await upload(owner.cookie, temple, png)).json()
      .id as string
    const pinned = (await uploadPhoto(owner.cookie, tripId, png, near)).json()
      .id as string

    const would = await patch(owner.cookie, unplaced, { spotId: null })
    expect(would.statusCode).toBe(400)
    expect(would.json()).toEqual({ error: 'would_unplace' })
    // A gallery photo has no point either.
    expect(
      (await patch(owner.cookie, gallery, { spotId: null })).statusCode,
    ).toBe(400)
    // With its own point a photo may leave the spot.
    const unlinked = await patch(owner.cookie, pinned, { spotId: null })
    expect(unlinked.statusCode).toBe(200)
    expect(unlinked.json()).toMatchObject({ spotId: null, lat: near.lat })
    // A new point in the same call is fine too.
    expect(
      (await patch(owner.cookie, gallery, { spotId: null, ...farAway }))
        .statusCode,
    ).toBe(200)

    const captioned = await patch(owner.cookie, unplaced, { caption: 'Hello' })
    expect(captioned.json().caption).toBe('Hello')
    expect(
      (await patch(owner.cookie, unplaced, { caption: null })).json().caption,
    ).toBeNull()
    await patch(owner.cookie, unplaced, { caption: 'Again' })
    expect(
      (await patch(owner.cookie, unplaced, { caption: '' })).json().caption,
    ).toBeNull()
    expect(
      (await patch(owner.cookie, unplaced, { caption: 'x'.repeat(501) }))
        .statusCode,
    ).toBe(400)
    expect((await patch(owner.cookie, unplaced, { lat: 5 })).statusCode).toBe(
      400,
    )
    expect((await patch(owner.cookie, unplaced, { bogus: 1 })).statusCode).toBe(
      400,
    )
  })

  it('T-47-04 answers 404 for a spot of another trip, 403 for a visitor, 404 for a stranger, 401 without a session', async () => {
    const owner = await login('100000000000000484')
    const tripId = await createTrip(owner.cookie)
    const otherTrip = await createTrip(owner.cookie)
    const foreignSpot = await createSpot(
      owner.cookie,
      otherTrip,
      'Elsewhere',
      spotPoint,
    )
    const id = (await uploadPhoto(owner.cookie, tripId, png, {})).json()
      .id as string

    expect(
      (await patch(owner.cookie, id, { spotId: foreignSpot })).statusCode,
    ).toBe(404)
    const visitor = await login('100000000000000485')
    await addMember(tripId, visitor.user.id, 'visitor')
    expect(
      (await patch(visitor.cookie, id, { caption: 'no' })).statusCode,
    ).toBe(403)
    const stranger = await login('100000000000000486')
    expect(
      (await patch(stranger.cookie, id, { caption: 'no' })).statusCode,
    ).toBe(404)
    expect(
      (
        await patch(owner.cookie, '99999999-9999-4999-8999-999999999999', {
          caption: 'x',
        })
      ).statusCode,
    ).toBe(404)
    expect((await patch('', id, { caption: 'no' })).statusCode).toBe(401)
    const planner = await login('100000000000000487')
    await addMember(tripId, planner.user.id, 'planner')
    expect(
      (await patch(planner.cookie, id, { caption: 'yes' })).statusCode,
    ).toBe(200)
    expect(
      (
        await db.pool.query(
          `SELECT 1 FROM activity_events WHERE action = 'image.update'`,
        )
      ).rowCount,
    ).toBe(1)
  })

  it('T-47-04 deletes a photo without a spot and queues its blob', async () => {
    const owner = await login('100000000000000488')
    const tripId = await createTrip(owner.cookie)
    const id = (await uploadPhoto(owner.cookie, tripId, png, {})).json()
      .id as string
    const removed = await app.inject({
      method: 'DELETE',
      url: `/images/${id}`,
      headers: { cookie: owner.cookie, origin: WEB_ORIGIN },
    })
    expect(removed.statusCode).toBe(204)
    expect(await imageCount()).toBe(0)
    const queued = await db.pool.query(
      `SELECT 1 FROM blob_deletions WHERE storage_key LIKE $1`,
      [`trips/${tripId}/photos/%`],
    )
    expect(queued.rowCount).toBe(1)
    const event = await db.pool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM activity_events WHERE action = 'image.delete'`,
    )
    expect(event.rows[0]?.metadata).toEqual({})
  })

  async function login(discordId: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId },
    })
    expect(response.statusCode).toBe(200)
    return {
      cookie: sessionHeader(response),
      user: response.json() as { id: string; username: string },
    }
  }

  async function createTrip(cookie: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: jsonHeaders(cookie),
      payload: {
        name: 'Honshu',
        timezone: 'Asia/Tokyo',
        region: { bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 } },
      },
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  async function createSpot(
    cookie: string,
    tripId: string,
    title: string,
    point: { lat: number; lng: number },
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/spots`,
      headers: jsonHeaders(cookie),
      payload: { title, ...point, baseCategory: 'must_go' },
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  function uploadPhoto(
    cookie: string,
    tripId: string,
    file: Buffer,
    fields: Record<string, string | number>,
  ) {
    const body = multipart(file, 'photo.jpg', fields)
    return app.inject({
      method: 'POST',
      url: `/trips/${tripId}/photos`,
      headers: {
        ...body.headers,
        ...(cookie ? { cookie } : {}),
        origin: WEB_ORIGIN,
      },
      payload: body.payload,
    })
  }

  function upload(cookie: string, spotId: string, file: Buffer) {
    const body = multipart(file, 'gallery.png')
    return app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images`,
      headers: { ...body.headers, cookie, origin: WEB_ORIGIN },
      payload: body.payload,
    })
  }

  function patch(cookie: string, id: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: `/images/${id}`,
      headers: cookie
        ? jsonHeaders(cookie)
        : { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload,
    })
  }

  async function addMember(tripId: string, userId: string, role: string) {
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, $3)`,
      [tripId, userId, role],
    )
  }

  async function imageCount(): Promise<number> {
    const result = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM images',
    )
    return result.rows[0]?.n ?? 0
  }
})

// Text fields go before the file, as the browser sends them.
function multipart(
  file: Buffer,
  filename: string,
  fields: Record<string, string | number> = {},
) {
  const boundary = '----tripboard'
  const text = Object.entries(fields)
    .map(
      ([name, value]) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    )
    .join('')
  const head = Buffer.from(
    `${text}--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return {
    payload: Buffer.concat([head, file, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}

async function jpegWithGps(): Promise<Buffer> {
  return sharp({
    create: {
      width: 4000,
      height: 3000,
      channels: 3,
      background: { r: 12, g: 80, b: 140 },
    },
  })
    .withMetadata({
      exif: {
        IFD0: { ImageDescription: 'temple' },
        IFD3: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '35/1 40/1 0/1',
          GPSLongitudeRef: 'E',
          GPSLongitude: '139/1 46/1 0/1',
        },
      },
    })
    .jpeg()
    .toBuffer()
}

function jsonHeaders(cookie: string) {
  return { cookie, origin: WEB_ORIGIN, 'content-type': 'application/json' }
}

function headerCookies(response: LightMyRequestResponse): string[] {
  const raw = response.headers['set-cookie']
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

function sessionHeader(response: LightMyRequestResponse): string {
  const cookie = headerCookies(response).find((value) =>
    value.startsWith('tb_session='),
  )
  const pair = (cookie ?? '').split(';')[0] ?? ''
  return `tb_session=${pair.slice(pair.indexOf('=') + 1)}`
}
