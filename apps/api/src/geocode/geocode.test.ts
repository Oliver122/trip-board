import type { LightMyRequestResponse } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'
const USER_AGENT = 'TripBoardTest/1.0 (geocode suite)'

const japan = {
  name: 'Japan 2026',
  timezone: 'Asia/Tokyo',
  region: {
    bbox: { minLng: 122.94, minLat: 24.4, maxLng: 145.82, maxLat: 45.55 },
  },
}

type Call = { url: string; agent: string | null; at: number }

describe('geocode', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig
  const calls: Call[] = []

  beforeAll(async () => {
    db = await createTestDatabase()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
      NOMINATIM_USER_AGENT: USER_AGENT,
    })
    const geocodeFetch: typeof fetch = async (input, init) => {
      const url = input instanceof URL ? input : new URL(String(input))
      const headers = new Headers(init?.headers)
      calls.push({
        url: url.toString(),
        agent: headers.get('user-agent'),
        at: Date.now(),
      })
      if (url.searchParams.get('q') === 'explode') {
        return new Response('upstream down', { status: 500 })
      }
      if (url.pathname.endsWith('/reverse')) {
        return jsonResponse({
          display_name: 'Kyoto, Japan',
          lat: '35.0116',
          lon: '135.7681',
          boundingbox: ['34.9', '35.1', '135.6', '135.8'],
        })
      }
      const q = url.searchParams.get('q') ?? ''
      return jsonResponse([
        {
          display_name: q,
          lat: '35.0',
          lon: '135.0',
          boundingbox: ['34.9', '35.1', '134.9', '135.1'],
        },
      ])
    }
    app = await buildApp(db.pool, {
      config,
      now: () => new Date('2026-06-01T00:00:00.000Z'),
      geocodeFetch,
    })
  })

  afterAll(async () => {
    await app.close()
    await db.drop()
  })

  beforeEach(async () => {
    calls.length = 0
    await db.pool.query(`
      DELETE FROM plan_entry_spots;
      DELETE FROM images;
      DELETE FROM plan_entries;
      DELETE FROM spots;
      DELETE FROM trip_invites;
      DELETE FROM trip_members;
      DELETE FROM trips;
      DELETE FROM activity_events;
      DELETE FROM geocode_cache;
      DELETE FROM blob_deletions;
      DELETE FROM sessions;
      DELETE FROM users;
    `)
  })

  it('T-06-07 serves the second identical search from cache', async () => {
    const owner = await login('100000000000000711')
    const first = await search(owner.cookie, 'q=Fushimi%20Inari')
    const second = await search(owner.cookie, 'q=fushimi%20inari')
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual(first.json())
    expect(first.json().results[0]).toMatchObject({
      label: 'Fushimi Inari',
      lat: 35,
      lng: 135,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.agent).toBe(USER_AGENT)
  })

  it('biases search to the trip bbox when tripId is set', async () => {
    const owner = await login('100000000000000712')
    const stranger = await login('100000000000000713')
    const tripId = await createTrip(owner.cookie)
    const response = await search(owner.cookie, `q=Kyoto&tripId=${tripId}`)
    expect(response.statusCode).toBe(200)
    const url = new URL(calls[0]?.url ?? 'http://invalid')
    expect(url.searchParams.get('viewbox')).toBe('122.94,45.55,145.82,24.4')

    const hidden = await search(stranger.cookie, `q=Kyoto&tripId=${tripId}`)
    expect(hidden.statusCode).toBe(404)
    expect(hidden.json()).toEqual({ error: 'not_found' })
  })

  it('T-06-09 returns 502 for an upstream error and a normalised place', async () => {
    const owner = await login('100000000000000714')
    const failed = await search(owner.cookie, 'q=explode')
    expect(failed.statusCode).toBe(502)
    expect(failed.json()).toEqual({ error: 'geocode_unavailable' })

    const reverse = await app.inject({
      method: 'GET',
      url: '/geocode/reverse?lat=35.0116&lng=135.7681&lang=de',
      headers: { cookie: owner.cookie },
    })
    expect(reverse.statusCode).toBe(200)
    expect(reverse.json()).toEqual({
      label: 'Kyoto, Japan',
      lat: 35.0116,
      lng: 135.7681,
      bbox: {
        minLat: 34.9,
        maxLat: 35.1,
        minLng: 135.6,
        maxLng: 135.8,
      },
    })
  })

  it('rejects anonymous callers and invalid coordinates', async () => {
    const owner = await login('100000000000000715')
    const anon = await app.inject({
      method: 'GET',
      url: '/geocode/search?q=Kyoto',
    })
    expect(anon.statusCode).toBe(401)
    const empty = await search(owner.cookie, 'q=')
    expect(empty.statusCode).toBe(400)
    expect(empty.json().fields.q).toBe('empty')
    const lat = await app.inject({
      method: 'GET',
      url: '/geocode/reverse?lat=91&lng=135',
      headers: { cookie: owner.cookie },
    })
    expect(lat.statusCode).toBe(400)
    expect(lat.json().fields.lat).toBe('invalid')
  })

  it('T-06-08 spaces parallel uncached searches at least one second apart', async () => {
    const owner = await login('100000000000000716')
    const before = calls.length
    const responses = await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((q) => search(owner.cookie, `q=${q}`)),
    )
    expect(responses.map((response) => response.statusCode)).toEqual([
      200, 200, 200, 200, 200,
    ])
    const batch = calls.slice(before)
    expect(batch).toHaveLength(5)
    for (let index = 1; index < batch.length; index += 1) {
      const previous = batch[index - 1]
      const current = batch[index]
      expect(
        current && previous ? current.at - previous.at : 0,
      ).toBeGreaterThanOrEqual(1000)
    }
  }, 20_000)

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
      payload: japan,
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  function search(cookie: string, query: string) {
    return app.inject({
      method: 'GET',
      url: `/geocode/search?${query}`,
      headers: { cookie },
    })
  }
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

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
  return `tb_session=${cookieValue(cookie ?? '')}`
}
