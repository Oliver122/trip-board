import { crc32, deflateSync } from 'node:zlib'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { createS3Storage, type ObjectStorage } from './storage.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'

describe('decode failures (R-44-07)', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig
  let storage: ObjectStorage
  const now = new Date('2026-06-01T00:00:00.000Z')
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
    app = await buildApp(db.pool, { config, now: () => now, storage })
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
    `)
    const keys = await storage.list()
    await Promise.all(keys.map((key) => storage.delete(key)))
  })

  it('T-44-07 a 30000x30000 bomb answers 415 and stores nothing; a normal upload follows', async () => {
    const { cookie, spotId } = await setup('100000000000004407')
    const before = await storage.list()

    const bomb = await upload(cookie, spotId, bombPng(), 'bomb.png')
    expect(bomb.statusCode).toBe(415)
    expect(bomb.json()).toEqual({ error: 'unsupported_media' })
    expect(await imageCount()).toBe(0)
    expect(await storage.list()).toEqual(before)

    expect((await upload(cookie, spotId, png, 'ok.png')).statusCode).toBe(201)
  })

  it('T-44-07 bombs do not consume the upload rate limit', async () => {
    const { cookie, spotId } = await setup('100000000000004408')
    const bomb = bombPng()
    for (let i = 0; i < 31; i++) {
      expect((await upload(cookie, spotId, bomb, 'bomb.png')).statusCode).toBe(
        415,
      )
    }
    expect((await upload(cookie, spotId, png, 'ok.png')).statusCode).toBe(201)
  })

  it('T-44-07 truncated PNG and JPEG answer 415', async () => {
    const { cookie, spotId } = await setup('100000000000004409')
    // Random pixels so the encoded file is large enough to cut meaningfully.
    const pixels = Buffer.alloc(400 * 400 * 3)
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 7919) % 251
    const big = await sharp(pixels, {
      raw: { width: 400, height: 400, channels: 3 },
    })
      .png()
      .toBuffer()
    const jpeg = await sharp(big).jpeg().toBuffer()
    for (const [file, name] of [
      [big.subarray(0, Math.floor(big.length / 2)), 'cut.png'],
      [jpeg.subarray(0, Math.floor(jpeg.length / 2)), 'cut.jpg'],
    ] as const) {
      const response = await upload(cookie, spotId, file, name)
      expect(response.statusCode).toBe(415)
      expect(response.json()).toEqual({ error: 'unsupported_media' })
    }
    expect(await imageCount()).toBe(0)
  })

  async function setup(discordId: string) {
    const login = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId },
    })
    expect(login.statusCode).toBe(200)
    const cookie = sessionHeader(login)
    const trip = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: jsonHeaders(cookie),
      payload: {
        name: 'Honshu',
        timezone: 'Asia/Tokyo',
        region: { bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 } },
      },
    })
    expect(trip.statusCode).toBe(201)
    const spot = await app.inject({
      method: 'POST',
      url: `/trips/${trip.json().id}/spots`,
      headers: jsonHeaders(cookie),
      payload: {
        title: 'Temple',
        lat: 35.6812,
        lng: 139.7671,
        baseCategory: 'must_go',
      },
    })
    expect(spot.statusCode).toBe(201)
    return { cookie, spotId: spot.json().id as string }
  }

  function upload(cookie: string, spotId: string, file: Buffer, name: string) {
    const boundary = '----tripboard'
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    return app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images`,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        cookie,
        origin: WEB_ORIGIN,
      },
      payload,
    })
  }

  async function imageCount(): Promise<number> {
    const result = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM images',
    )
    return result.rows[0]?.n ?? 0
  }
})

// A PNG whose IHDR declares 30000 x 30000 but carries one tiny IDAT.
function bombPng(): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(30000, 0)
  ihdr.writeUInt32BE(30000, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(16))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
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
  const all = Array.isArray(raw) ? raw : raw ? [raw] : []
  const cookie = all.find((value) => value.startsWith('tb_session=')) ?? ''
  return (cookie.split(';')[0] ?? '').trim()
}
