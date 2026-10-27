import type { LightMyRequestResponse } from 'fastify'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { createS3Storage, type ObjectStorage } from './storage.js'
import { drainBlobDeletions } from './worker.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'

const honshu = {
  name: 'Honshu',
  timezone: 'Asia/Tokyo',
  region: {
    bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 },
  },
}

describe('images', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig
  let storage: ObjectStorage
  let now = new Date('2026-06-01T00:00:00.000Z')
  let failInsert = false
  let png: Buffer

  beforeAll(async () => {
    db = await createTestDatabase()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
      S3_BUCKET: 'tripboard-test',
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
      now: () => now,
      storage,
      beforeImageInsert: async () => {
        if (failInsert) throw new Error('insert failed')
      },
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
    now = new Date('2026-06-01T00:00:00.000Z')
    failInsert = false
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

  it('T-08-01 stores a resized WebP with no EXIF and records the upload', async () => {
    const owner = await login('100000000000000801')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)
    const jpeg = await jpegWithGps()
    const input = await sharp(jpeg).metadata()
    expect(input.width).toBe(4000)
    expect(input.height).toBe(3000)
    expect(input.exif?.toString('binary')).toContain('N')
    expect(input.exif?.toString('binary')).toContain('E')

    const created = await upload(owner.cookie, spotId, jpeg, 'temple.jpg')
    expect(created.statusCode).toBe(201)
    const image = created.json()
    expect(image).toMatchObject({
      tripId,
      spotId,
      width: 2048,
      height: 1536,
    })
    expect(image.bytes).toBeGreaterThan(0)
    expect(image.url).toContain(`/images/${image.id}/file?exp=`)

    const stored = await db.pool.query<{
      bytes: number
      width: number
      height: number
      storage_key: string
      action: string
    }>(
      `
      SELECT i.bytes, i.width, i.height, i.storage_key, e.action
      FROM images i
      JOIN activity_events e ON e.entity_id = i.id
      WHERE i.id = $1
      `,
      [image.id],
    )
    expect(stored.rows[0]).toMatchObject({
      bytes: image.bytes,
      width: 2048,
      height: 1536,
      action: 'image.upload',
    })
    expect(stored.rows[0]?.storage_key).toMatch(
      new RegExp(`^trips/${tripId}/spots/${spotId}/.+\\.webp$`),
    )

    const webp = await sharp(
      await storage.get(stored.rows[0]!.storage_key),
    ).metadata()
    expect(webp.format).toBe('webp')
    expect(webp.width).toBe(2048)
    expect(webp.height).toBe(1536)
    expect(webp.exif).toBeUndefined()

    const quota = await app.inject({
      method: 'GET',
      url: '/me/quota',
      headers: { cookie: owner.cookie },
    })
    expect(quota.statusCode).toBe(200)
    expect(quota.json()).toMatchObject({
      usedImages: 1,
      maxImages: 100,
      usedBytes: image.bytes,
      maxBytes: 209715200,
    })
  })

  it('T-08-02 rejects an oversized file and a PDF with a jpeg name', async () => {
    const owner = await login('100000000000000802')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)

    const huge = Buffer.alloc(11 * 1024 * 1024, 0)
    huge[0] = 0xff
    huge[1] = 0xd8
    huge[2] = 0xff
    const tooBig = await upload(owner.cookie, spotId, huge, 'big.jpg')
    expect(tooBig.statusCode).toBe(413)
    expect(tooBig.json()).toEqual({
      error: 'too_large',
      maxFileBytes: 10 * 1024 * 1024,
    })

    const pdf = await upload(
      owner.cookie,
      spotId,
      Buffer.from('%PDF-1.4\nnot an image'),
      'notes.jpg',
    )
    expect(pdf.statusCode).toBe(415)
    expect(pdf.json()).toEqual({ error: 'unsupported_media' })
    expect(await imageCount()).toBe(0)
    expect(await storage.list()).toEqual([])
  })

  it('T-08-03 returns 413 with usage when the image count is full', async () => {
    const owner = await login('100000000000000803')
    await db.pool.query('UPDATE users SET max_images = 2 WHERE id = $1', [
      owner.user.id,
    ])
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)
    expect((await upload(owner.cookie, spotId, png, 'a.png')).statusCode).toBe(
      201,
    )
    expect((await upload(owner.cookie, spotId, png, 'b.png')).statusCode).toBe(
      201,
    )
    const third = await upload(owner.cookie, spotId, png, 'c.png')
    expect(third.statusCode).toBe(413)
    expect(third.json()).toMatchObject({
      error: 'quota_exceeded',
      usedImages: 2,
      maxImages: 2,
    })
    expect(await imageCount()).toBe(2)
  })

  it('T-08-04 lets exactly one of two parallel uploads take the last slot', async () => {
    const owner = await login('100000000000000804')
    await db.pool.query('UPDATE users SET max_images = 2 WHERE id = $1', [
      owner.user.id,
    ])
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)
    expect((await upload(owner.cookie, spotId, png, 'a.png')).statusCode).toBe(
      201,
    )
    const [first, second] = await Promise.all([
      upload(owner.cookie, spotId, png, 'b.png'),
      upload(owner.cookie, spotId, png, 'c.png'),
    ])
    expect([first.statusCode, second.statusCode].sort()).toEqual([201, 413])
    expect(await imageCount()).toBe(2)
  })

  it('T-08-05 rejects an upload that exceeds the byte quota after compression', async () => {
    const owner = await login('100000000000000805')
    await db.pool.query('UPDATE users SET max_bytes = 1 WHERE id = $1', [
      owner.user.id,
    ])
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)
    const response = await upload(owner.cookie, spotId, png, 'a.png')
    expect(response.statusCode).toBe(413)
    expect(response.json()).toMatchObject({
      error: 'quota_exceeded',
      usedBytes: 0,
      maxBytes: 1,
    })
    expect(await imageCount()).toBe(0)
    expect(await storage.list()).toEqual([])
  })

  it('T-08-06 removes the object when the database insert fails', async () => {
    const owner = await login('100000000000000806')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)
    failInsert = true
    const response = await upload(owner.cookie, spotId, png, 'a.png')
    expect(response.statusCode).toBeGreaterThanOrEqual(500)
    expect(await imageCount()).toBe(0)
    expect(await storage.list()).toEqual([])
  })

  it('T-08-07 hides signed URLs from non-members and expires them after 10 minutes', async () => {
    const owner = await login('100000000000000807')
    const stranger = await login('100000000000000808')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)
    const created = await upload(owner.cookie, spotId, png, 'a.png')
    const image = created.json()

    const hidden = await app.inject({
      method: 'GET',
      url: `/images/${image.id}`,
      headers: { cookie: stranger.cookie },
    })
    expect(hidden.statusCode).toBe(404)

    const file = await app.inject({ method: 'GET', url: image.url })
    expect(file.statusCode).toBe(200)
    expect(file.headers['content-type']).toContain('image/webp')

    now = new Date(now.getTime() + 10 * 60 * 1000 + 1000)
    const expired = await app.inject({ method: 'GET', url: image.url })
    expect(expired.statusCode).toBe(403)
  })

  it('T-08-08 deletes blobs after an image, spot, or trip is removed', async () => {
    const owner = await login('100000000000000809')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)
    const image = await uploaded(owner.cookie, spotId, 'a.png')

    const removed = await app.inject({
      method: 'DELETE',
      url: `/images/${image.id}`,
      headers: writeHeaders(owner.cookie),
    })
    expect(removed.statusCode).toBe(204)
    expect(await storage.exists(image.key)).toBe(true)
    await drainBlobDeletions(db.pool, storage, new Date())
    expect(await storage.exists(image.key)).toBe(false)

    const spotImage = await uploaded(owner.cookie, spotId, 'b.png')
    const spotGone = await app.inject({
      method: 'DELETE',
      url: `/spots/${spotId}`,
      headers: writeHeaders(owner.cookie),
    })
    expect(spotGone.statusCode).toBe(204)
    await drainBlobDeletions(db.pool, storage, new Date())
    expect(await storage.exists(spotImage.key)).toBe(false)

    const nextSpot = await createSpot(owner.cookie, tripId)
    const tripImage = await uploaded(owner.cookie, nextSpot, 'c.png')
    const tripGone = await app.inject({
      method: 'DELETE',
      url: `/trips/${tripId}`,
      headers: writeHeaders(owner.cookie),
    })
    expect(tripGone.statusCode).toBe(204)
    await drainBlobDeletions(db.pool, storage, new Date())
    expect(await storage.exists(tripImage.key)).toBe(false)
    const queued = await db.pool.query(
      'SELECT count(*)::int AS n FROM blob_deletions',
    )
    expect(queued.rows[0]?.n).toBe(0)

    const events = await db.pool.query<{ action: string }>(
      `SELECT action FROM activity_events WHERE action = 'image.delete'`,
    )
    expect(events.rows.length).toBeGreaterThan(0)
  })

  it('T-08-09 returns 429 on the 31st upload within a minute', async () => {
    const owner = await login('100000000000000810')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)
    for (let index = 0; index < 30; index += 1) {
      const response = await upload(owner.cookie, spotId, png, `${index}.png`)
      expect(response.statusCode).toBe(201)
    }
    const limited = await upload(owner.cookie, spotId, png, 'over.png')
    expect(limited.statusCode).toBe(429)
    expect(limited.json()).toEqual({ error: 'rate_limited' })
    expect(await imageCount()).toBe(30)
  })

  it('T-08-10 rejects a visitor upload', async () => {
    const owner = await login('100000000000000811')
    const visitor = await login('100000000000000812')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, visitor.user.id, 'visitor')
    const spotId = await createSpot(owner.cookie, tripId)
    const response = await upload(visitor.cookie, spotId, png, 'a.png')
    expect(response.statusCode).toBe(403)
    expect(await imageCount()).toBe(0)
  })

  it('T-08-13 pauses uploads and allows them again when re-enabled', async () => {
    const owner = await login('100000000000000813')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)
    await db.pool.query('UPDATE app_settings SET uploads_enabled = false')
    const paused = await upload(owner.cookie, spotId, png, 'a.png')
    expect(paused.statusCode).toBe(503)
    expect(paused.json()).toEqual({
      error: 'uploads_paused',
      message: 'Uploads are paused',
    })
    expect(await imageCount()).toBe(0)

    await db.pool.query('UPDATE app_settings SET uploads_enabled = true')
    const restored = await upload(owner.cookie, spotId, png, 'a.png')
    expect(restored.statusCode).toBe(201)
  })

  it('rejects anonymous callers, a foreign origin, and a bad id', async () => {
    const owner = await login('100000000000000814')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)
    const created = await upload(owner.cookie, spotId, png, 'a.png')
    const imageId = created.json().id as string

    for (const url of [
      '/me/quota',
      `/spots/${spotId}/images`,
      `/images/${imageId}`,
    ]) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode).toBe(401)
    }
    const posted = await upload('', spotId, png, 'a.png')
    expect(posted.statusCode).toBe(401)
    const removed = await app.inject({
      method: 'DELETE',
      url: `/images/${imageId}`,
    })
    expect(removed.statusCode).toBe(401)

    const foreign = await upload(
      owner.cookie,
      spotId,
      png,
      'a.png',
      'https://evil.example',
    )
    expect(foreign.statusCode).toBe(403)
    expect(foreign.json()).toEqual({ error: 'forbidden_origin' })

    const bad = await app.inject({
      method: 'GET',
      url: '/images/not-a-uuid',
      headers: { cookie: owner.cookie },
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().fields.id).toBe('invalid')

    const missing = await app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images`,
      headers: {
        ...writeHeaders(owner.cookie),
        'content-type': 'application/json',
      },
      payload: {},
    })
    expect(missing.statusCode).toBe(400)
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
      payload: honshu,
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  async function createSpot(cookie: string, tripId: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/spots`,
      headers: jsonHeaders(cookie),
      payload: {
        title: 'Temple',
        lat: 35.6812,
        lng: 139.7671,
        baseCategory: 'must_go',
      },
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  function upload(
    cookie: string,
    spotId: string,
    file: Buffer,
    filename: string,
    origin = WEB_ORIGIN,
  ) {
    const body = multipart(file, filename)
    return app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images`,
      headers: {
        ...body.headers,
        cookie,
        origin,
      },
      payload: body.payload,
    })
  }

  async function uploaded(cookie: string, spotId: string, filename: string) {
    const response = await upload(cookie, spotId, png, filename)
    expect(response.statusCode).toBe(201)
    const id = response.json().id as string
    const row = await db.pool.query<{ storage_key: string }>(
      'SELECT storage_key FROM images WHERE id = $1',
      [id],
    )
    return { id, key: row.rows[0]!.storage_key }
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

function multipart(file: Buffer, filename: string) {
  const boundary = '----tripboard'
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
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

function writeHeaders(cookie: string) {
  return { cookie, origin: WEB_ORIGIN }
}

function jsonHeaders(cookie: string) {
  return { ...writeHeaders(cookie), 'content-type': 'application/json' }
}

function headerCookies(response: LightMyRequestResponse): string[] {
  const raw = response.headers['set-cookie']
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

function cookieValue(setCookie: string): string {
  const pair = setCookie.split(';')[0] ?? ''
  return pair.slice(pair.indexOf('=') + 1)
}

function sessionHeader(response: LightMyRequestResponse): string {
  const cookie = headerCookies(response).find((value) =>
    value.startsWith('tb_session='),
  )
  return `tb_session=${cookieValue(cookie ?? '')}`
}
