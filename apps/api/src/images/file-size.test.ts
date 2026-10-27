import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { createS3Storage, type ObjectStorage } from './storage.js'
import type { WebFetchOptions } from './web-fetch.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'
const MiB = 1024 * 1024

const honshu = {
  name: 'Honshu',
  timezone: 'Asia/Tokyo',
  region: { bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 } },
}

describe('per-user file size limit', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let storage: ObjectStorage
  let small: Buffer
  const web: WebFetchOptions = {}
  let served: Buffer = Buffer.alloc(0)
  let counter = 0

  beforeAll(async () => {
    db = await createTestDatabase()
    const config: AppConfig = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
      S3_BUCKET: 'tripboard-test',
    })
    storage = createS3Storage(config)
    small = await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 3,
        background: { r: 12, g: 80, b: 140 },
      },
    })
      .jpeg()
      .toBuffer()
    app = await buildApp(db.pool, {
      config,
      now: () => new Date('2026-06-01T00:00:00.000Z'),
      storage,
      webFetch: web,
      commonsFetch: async (input) => {
        const url = new URL(String(input))
        const titles = (url.searchParams.get('titles') ?? '').split('|')
        const slug = 'Big_Temple.jpg'
        return new Response(
          JSON.stringify({
            query: {
              pages: titles.map((title) => ({
                title,
                imageinfo: [
                  {
                    thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${slug}/2048px-${slug}`,
                    url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${slug}`,
                    width: 4000,
                    height: 3000,
                    mime: 'image/jpeg',
                    descriptionurl: `https://commons.wikimedia.org/wiki/File:${slug}`,
                    extmetadata: {
                      Artist: { value: 'Someone' },
                      LicenseShortName: { value: 'CC BY 4.0' },
                    },
                  },
                ],
              })),
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        )
      },
    })
  }, 60_000)

  afterAll(async () => {
    await app?.close()
    await clearBlobs().catch(() => undefined)
    await db?.pool.end()
    await db?.drop()
  })

  beforeEach(async () => {
    for (const key of Object.keys(web))
      delete (web as Record<string, unknown>)[key]
    Object.assign(web, {
      resolveHost: async () => ['127.0.0.1'],
      allowAddress: (address: string) => address === '127.0.0.1',
      allowPort: () => true,
      intercept: (url: URL) =>
        url.hostname === 'files.test' || url.hostname === 'upload.wikimedia.org'
          ? { status: 200, body: served }
          : null,
    } satisfies WebFetchOptions)
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
      DELETE FROM commons_cache;
      DELETE FROM admin_audit_log;
      DELETE FROM sessions;
      DELETE FROM users;
      UPDATE app_settings
      SET uploads_enabled = true,
          default_max_images = 100,
          default_max_bytes = 2097152000,
          default_max_file_bytes = 10485760;
    `)
    await clearBlobs()
  })

  it('T-43-02 stops an 11 MB upload at 10 MB, stores nothing, and lets an override raise the limit', async () => {
    const { tom, aiko, admin, spotId } = await scene()

    const tooBig = await upload(tom, spotId, paddedJpeg(small, 11 * MiB))
    expect(tooBig.statusCode).toBe(413)
    expect(tooBig.json()).toEqual({
      error: 'too_large',
      maxFileBytes: 10 * MiB,
    })
    expect(await imageCount()).toBe(0)
    expect(await storage.list()).toEqual([])

    const patch = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${aiko.user.id}/quota`,
      headers: jsonHeaders(admin.cookie),
      payload: { maxFileBytes: 20 * MiB },
    })
    expect(patch.statusCode).toBe(200)

    const fine = await upload(aiko, spotId, paddedJpeg(small, 15 * MiB))
    expect(fine.statusCode).toBe(201)
    expect(await imageCount()).toBe(1)

    // The next limit up is enforced too, not only the first one.
    const over = await upload(aiko, spotId, paddedJpeg(small, 21 * MiB))
    expect(over.statusCode).toBe(413)
    expect(over.json()).toEqual({ error: 'too_large', maxFileBytes: 20 * MiB })
  })

  it('T-43-02 refuses a declared Content-Length of 30 MiB before the body is read', async () => {
    const { aiko, admin, spotId } = await scene()
    await db.pool.query('UPDATE users SET max_file_bytes = $2 WHERE id = $1', [
      aiko.user.id,
      20 * MiB,
    ])
    void admin
    const body = multipart(small)
    const started = Date.now()
    // The body is a few hundred bytes and a valid image: only the declared
    // length can make this a 413.
    const response = await app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images`,
      headers: {
        ...body.headers,
        cookie: aiko.cookie,
        origin: WEB_ORIGIN,
        'content-length': String(30 * MiB),
      },
      payload: body.payload,
    })
    expect(response.statusCode).toBe(413)
    expect(response.json()).toEqual({
      error: 'too_large',
      maxFileBytes: 20 * MiB,
    })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(await imageCount()).toBe(0)
    expect(await storage.list()).toEqual([])
  })

  it('T-43-03 applies the platform default at once, but not to users with an override', async () => {
    const { tom, aiko, admin, spotId } = await scene()
    await db.pool.query('UPDATE users SET max_file_bytes = $2 WHERE id = $1', [
      aiko.user.id,
      20 * MiB,
    ])

    const patch = await app.inject({
      method: 'PATCH',
      url: '/admin/settings',
      headers: jsonHeaders(admin.cookie),
      payload: { defaultMaxFileBytes: 5 * MiB },
    })
    expect(patch.statusCode).toBe(200)
    expect(patch.json()).toMatchObject({ defaultMaxFileBytes: 5 * MiB })

    const tooBig = await upload(tom, spotId, paddedJpeg(small, 6 * MiB))
    expect(tooBig.statusCode).toBe(413)
    expect(tooBig.json()).toEqual({ error: 'too_large', maxFileBytes: 5 * MiB })

    const fine = await upload(aiko, spotId, paddedJpeg(small, 6 * MiB))
    expect(fine.statusCode).toBe(201)

    const audit = await db.pool.query(
      `SELECT before, after FROM admin_audit_log WHERE action = 'settings.update'`,
    )
    expect(audit.rows).toHaveLength(1)
    expect(audit.rows[0].before).toMatchObject({
      defaultMaxFileBytes: 10 * MiB,
    })
    expect(audit.rows[0].after).toMatchObject({ defaultMaxFileBytes: 5 * MiB })
  })

  it('T-43-05 returns the effective limit in GET /me/quota', async () => {
    const { tom, aiko, admin } = await scene()
    const quota = (user: { cookie: string }) =>
      app.inject({
        method: 'GET',
        url: '/me/quota',
        headers: { cookie: user.cookie },
      })
    expect((await quota(tom)).json()).toMatchObject({ maxFileBytes: 10 * MiB })
    expect((await quota(aiko)).json()).toMatchObject({ maxFileBytes: 10 * MiB })

    const patch = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${aiko.user.id}/quota`,
      headers: jsonHeaders(admin.cookie),
      payload: { maxFileBytes: 20 * MiB },
    })
    expect(patch.statusCode).toBe(200)
    expect((await quota(aiko)).json()).toMatchObject({
      maxFileBytes: 20971520,
    })
    expect((await quota(tom)).json()).toMatchObject({ maxFileBytes: 10485760 })
  })

  it('T-43-06 caps from-url and from-commons at the caller limit', async () => {
    const { tom, aiko, spotId } = await scene()
    await db.pool.query('UPDATE users SET max_file_bytes = $2 WHERE id = $1', [
      aiko.user.id,
      20 * MiB,
    ])
    served = paddedJpeg(small, 12 * MiB)

    const tooBig = await fromUrl(tom, spotId, 'https://files.test/big.jpg')
    expect(tooBig.statusCode).toBe(413)
    expect(tooBig.json()).toEqual({
      error: 'too_large',
      maxFileBytes: 10 * MiB,
    })

    const fine = await fromUrl(aiko, spotId, 'https://files.test/big.jpg')
    expect(fine.statusCode).toBe(201)

    const commons = await fromCommons(tom, spotId, 'File:Big_Temple.jpg')
    expect(commons.statusCode).toBe(413)
    expect(commons.json()).toEqual({
      error: 'too_large',
      maxFileBytes: 10 * MiB,
    })
    expect(await imageCount()).toBe(1)
  })

  async function scene() {
    const tom = await login()
    const aiko = await login()
    const admin = await login()
    await db.pool.query(`UPDATE users SET app_role = 'admin' WHERE id = $1`, [
      admin.user.id,
    ])
    const tripId = await createTrip(tom.cookie)
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'planner')`,
      [tripId, aiko.user.id],
    )
    const spotId = await createSpot(tom.cookie, tripId)
    return { tom, aiko, admin, spotId }
  }

  async function login() {
    counter += 1
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: {
        discordId: `1000000000004${String(counter).padStart(5, '0')}`,
      },
    })
    expect(response.statusCode).toBe(200)
    return {
      cookie: sessionHeader(response),
      user: response.json() as { id: string },
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
        lat: 35.0394,
        lng: 135.7292,
        baseCategory: 'must_go',
      },
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  function upload(user: { cookie: string }, spotId: string, file: Buffer) {
    const body = multipart(file)
    return app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images`,
      headers: { ...body.headers, cookie: user.cookie, origin: WEB_ORIGIN },
      payload: body.payload,
    })
  }

  function fromUrl(user: { cookie: string }, spotId: string, url: string) {
    return app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images/from-url`,
      headers: jsonHeaders(user.cookie),
      payload: { url },
    })
  }

  function fromCommons(
    user: { cookie: string },
    spotId: string,
    fileTitle: string,
  ) {
    return app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images/from-commons`,
      headers: jsonHeaders(user.cookie),
      payload: { fileTitle },
    })
  }

  async function imageCount(): Promise<number> {
    const result = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM images',
    )
    return result.rows[0]?.n ?? 0
  }

  async function clearBlobs() {
    const keys = await storage.list()
    await Promise.all(keys.map((key) => storage.delete(key)))
  }
})

// A valid JPEG grown to `size` bytes with COM segments right after SOI, so
// no binary fixtures are needed.
function paddedJpeg(jpeg: Buffer, size: number): Buffer {
  const segment = Buffer.concat([
    Buffer.from([0xff, 0xfe, 0xff, 0xff]),
    Buffer.alloc(0xffff - 2, 0x20),
  ])
  const parts: Buffer[] = [jpeg.subarray(0, 2)]
  let total = jpeg.length
  while (total + segment.length <= size) {
    parts.push(segment)
    total += segment.length
  }
  const rest = size - total
  if (rest >= 4) {
    parts.push(
      Buffer.from([0xff, 0xfe, (rest - 2) >> 8, (rest - 2) & 0xff]),
      Buffer.alloc(rest - 4, 0x20),
    )
  } else if (rest > 0) {
    parts.push(Buffer.alloc(0))
  }
  parts.push(jpeg.subarray(2))
  return Buffer.concat(parts)
}

function multipart(file: Buffer) {
  const boundary = '----tripboard'
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return {
    payload: Buffer.concat([head, file, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}

function jsonHeaders(cookie: string) {
  return {
    cookie,
    origin: WEB_ORIGIN,
    'content-type': 'application/json',
  }
}

function sessionHeader(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie']
  const cookies = Array.isArray(raw) ? raw : [String(raw)]
  const session = cookies.find((value) => value.startsWith('tb_session='))
  return (session ?? '').split(';')[0] ?? ''
}
