import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'

const honshu = {
  name: 'Honshu',
  timezone: 'Asia/Tokyo',
  region: {
    bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 },
  },
}

const kyotoRow = {
  title: 'Kinkaku-ji',
  lat: 35.0394,
  lng: 135.7292,
  address: 'Kinkakujicho, Kyoto',
}

const tokyoRow = {
  title: 'Tokyo Tower',
  lat: 35.6586,
  lng: 139.7454,
}

const outsideRow = {
  title: 'Taipei 101',
  lat: 25.0339,
  lng: 121.5645,
}

describe('spots import', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig
  let base: string

  beforeAll(async () => {
    db = await createTestDatabase()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
    })
    app = await buildApp(db.pool, {
      config,
      now: () => new Date('2026-06-01T00:00:00.000Z'),
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (!address || typeof address === 'string') throw new Error('no port')
    base = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await app.close()
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
  })

  it('T-23-06 imports spots, expands the bbox once, and fills displayCategory and createdBy', async () => {
    const owner = await login('100000000000002301')
    const tripId = await createTrip(owner.cookie)

    const response = await postImport(owner.cookie, tripId, {
      source: 'google_csv',
      baseCategory: 'maybe',
      spots: [kyotoRow, tokyoRow, outsideRow],
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as { created: number; spots: unknown[] }
    expect(body.created).toBe(3)
    expect(body.spots).toHaveLength(3)

    const listed = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}/spots`,
      headers: { cookie: owner.cookie },
    })
    const spots = listed.json().spots as {
      title: string
      displayCategory: string
      createdBy: { id: string } | null
    }[]
    expect(spots).toHaveLength(3)
    for (const spot of spots) {
      expect(spot.displayCategory).toBe('kind')
      expect(spot.createdBy?.id).toBe(owner.user.id)
    }

    const bbox = await tripBBox(owner.cookie, tripId)
    for (const row of [kyotoRow, tokyoRow, outsideRow]) {
      expect(row.lng).toBeGreaterThanOrEqual(bbox.minLng)
      expect(row.lng).toBeLessThanOrEqual(bbox.maxLng)
      expect(row.lat).toBeGreaterThanOrEqual(bbox.minLat)
      expect(row.lat).toBeLessThanOrEqual(bbox.maxLat)
    }
  })

  it('T-23-07 role matrix and validation for the import route', async () => {
    const owner = await login('100000000000002302')
    const planner = await login('100000000000002303')
    const visitor = await login('100000000000002304')
    const stranger = await login('100000000000002305')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, planner.user.id, 'planner')
    await addMember(tripId, visitor.user.id, 'visitor')

    const asOwner = await postImport(owner.cookie, tripId, {
      source: 'google_csv',
      baseCategory: 'maybe',
      spots: [kyotoRow],
    })
    expect(asOwner.statusCode).toBe(201)

    const asPlanner = await postImport(planner.cookie, tripId, {
      source: 'google_csv',
      baseCategory: 'maybe',
      spots: [tokyoRow],
    })
    expect(asPlanner.statusCode).toBe(201)

    const asVisitor = await postImport(visitor.cookie, tripId, {
      source: 'google_csv',
      baseCategory: 'maybe',
      spots: [kyotoRow],
    })
    expect(asVisitor.statusCode).toBe(403)

    const asStranger = await postImport(stranger.cookie, tripId, {
      source: 'google_csv',
      baseCategory: 'maybe',
      spots: [kyotoRow],
    })
    expect(asStranger.statusCode).toBe(404)

    const unknownTrip = await postImport(
      owner.cookie,
      '00000000-0000-0000-0000-00000000dead',
      { source: 'google_csv', baseCategory: 'maybe', spots: [kyotoRow] },
    )
    expect(unknownTrip.statusCode).toBe(404)

    const noSession = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/spots/import`,
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: {
        source: 'google_csv',
        baseCategory: 'maybe',
        spots: [kyotoRow],
      },
    })
    expect(noSession.statusCode).toBe(401)

    const before = await listSpotsCount(owner.cookie, tripId)

    const tooMany = await postImport(owner.cookie, tripId, {
      source: 'google_csv',
      baseCategory: 'maybe',
      spots: Array.from({ length: 501 }, (_unused, index) => ({
        ...kyotoRow,
        title: `Row ${index}`,
      })),
    })
    expect(tooMany.statusCode).toBe(400)

    const homeCategory = await postImport(owner.cookie, tripId, {
      source: 'google_csv',
      baseCategory: 'planned',
      spots: [kyotoRow],
    })
    expect(homeCategory.statusCode).toBe(400)
    expect(homeCategory.json().fields).toMatchObject({
      category: 'planned_automatic',
    })

    const badLat = await postImport(owner.cookie, tripId, {
      source: 'google_csv',
      baseCategory: 'maybe',
      spots: [kyotoRow, tokyoRow, { ...outsideRow, lat: 91 }],
    })
    expect(badLat.statusCode).toBe(400)
    expect(badLat.json().fields).toMatchObject({ 'spots.2.lat': 'invalid' })

    expect(await listSpotsCount(owner.cookie, tripId)).toBe(before)
  })

  it('T-23-08 records exactly one activity_events row for the import, none on rejection', async () => {
    const owner = await login('100000000000002306')
    const tripId = await createTrip(owner.cookie)

    const response = await postImport(owner.cookie, tripId, {
      source: 'kml',
      baseCategory: 'must_go',
      spots: [kyotoRow, tokyoRow, outsideRow],
    })
    expect(response.statusCode).toBe(201)

    const rows = await db.pool.query<{ action: string; metadata: unknown }>(
      `SELECT action, metadata FROM activity_events ORDER BY id`,
    )
    const importRows = rows.rows.filter((row) => row.action === 'spot.import')
    const createRows = rows.rows.filter((row) => row.action === 'spot.create')
    expect(importRows).toHaveLength(1)
    expect(createRows).toHaveLength(0)
    expect(importRows[0]?.metadata).toMatchObject({
      count: 3,
      source: 'kml',
    })

    const rejected = await postImport(owner.cookie, tripId, {
      source: 'kml',
      baseCategory: 'maybe',
      spots: [{ ...kyotoRow, lat: 91 }],
    })
    expect(rejected.statusCode).toBe(400)
    const after = await db.pool.query(
      `SELECT action FROM activity_events WHERE action = 'spot.import'`,
    )
    expect(after.rowCount).toBe(1)
  })

  it('T-23-09 another member receives exactly one spot change event for the import', async () => {
    const owner = await login('100000000000002307')
    const member = await login('100000000000002308')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, member.user.id, 'planner')

    const stream = await fetch(`${base}/trips/${tripId}/events`, {
      headers: { cookie: member.cookie },
    })
    expect(stream.status).toBe(200)
    const pending = track(stream)

    const imported = await postImport(owner.cookie, tripId, {
      source: 'google_csv',
      baseCategory: 'maybe',
      spots: [kyotoRow, tokyoRow],
    })
    expect(imported.statusCode).toBe(201)

    const text = await pending.wait(
      (body) => body.includes('"action":"spot.import"'),
      4000,
    )
    expect(text).toContain('"resource":"spot"')
    const changes = text.split('event: change').length - 1
    expect(changes).toBe(1)
    await pending.cancel()
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

  async function addMember(tripId: string, userId: string, role: string) {
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, $3)`,
      [tripId, userId, role],
    )
  }

  function postImport(cookie: string, tripId: string, payload: object) {
    return app.inject({
      method: 'POST',
      url: `/trips/${tripId}/spots/import`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  async function listSpotsCount(cookie: string, tripId: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}/spots`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    return response.json().total as number
  }

  async function tripBBox(cookie: string, tripId: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    return response.json().region.bbox as {
      minLng: number
      minLat: number
      maxLng: number
      maxLat: number
    }
  }
})

function writeHeaders(cookie: string) {
  return { cookie, origin: WEB_ORIGIN }
}

function jsonHeaders(cookie: string) {
  return {
    ...writeHeaders(cookie),
    'content-type': 'application/json',
  }
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
  if (!cookie) throw new Error('missing session cookie')
  return `tb_session=${cookieValue(cookie)}`
}

function track(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('no body')
  const decoder = new TextDecoder()
  let text = ''
  let settled = false
  const pump = (async () => {
    while (!settled) {
      const chunk = await reader.read()
      if (chunk.done) {
        settled = true
        return
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
  })()
  return {
    wait(done: (body: string) => boolean, timeoutMs: number) {
      return new Promise<string>((resolve, reject) => {
        const started = Date.now()
        const timer = setInterval(() => {
          if (done(text)) {
            clearInterval(timer)
            resolve(text)
          } else if (settled || Date.now() - started > timeoutMs) {
            clearInterval(timer)
            reject(new Error(`stream ended early: ${text}`))
          }
        }, 15)
      })
    },
    async cancel() {
      settled = true
      await reader.cancel().catch(() => undefined)
      await pump.catch(() => undefined)
    },
  }
}
