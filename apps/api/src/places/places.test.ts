import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { LinkResolveError, resolveShortLink } from './resolve.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'

const japan = {
  name: 'Japan 2026',
  timezone: 'Asia/Tokyo',
  region: {
    bbox: { minLng: 122.94, minLat: 24.4, maxLng: 145.82, maxLat: 45.55 },
  },
}

const kinkakuji =
  'https://www.google.com/maps/place/Kinkaku-ji/@35.0394,135.7292,17z/data=!3d35.0394!4d135.7292'

type Hop = { status: number; location?: string }
type Call = { url: string; method: string }

// Recorded Nominatim answers by search text.
const searches: Record<string, unknown[]> = {
  'Kinkaku-ji': [hit('Kinkaku-ji, Kita Ward, Kyoto', 35.0398, 135.7292)],
  'Ryoan-ji': [
    hit('Ryoan-ji, far away', 35.0394, 135.7292 + 0.022),
    hit('Ryoan-ji, Kyoto', 35.0397, 135.7295),
  ],
  Nowhere: [],
  'Ichiran Shibuya': [
    hit('Ichiran, Paris, France', 48.85, 2.35),
    hit('Ichiran Shibuya, Tokyo', 35.659, 139.7),
  ],
  Zzz: [],
}

function hit(label: string, lat: number, lng: number) {
  return {
    display_name: label,
    lat: String(lat),
    lon: String(lng),
    boundingbox: [
      String(lat - 0.001),
      String(lat + 0.001),
      String(lng - 0.001),
      String(lng + 0.001),
    ],
  }
}

describe('places from link', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let now = new Date('2026-06-01T00:00:00.000Z')
  let server = new Map<string, Hop>()
  const calls: Call[] = []
  const nominatimCalls: string[] = []
  let bodyRead = false
  let bodyCancelled = false

  beforeAll(async () => {
    db = await createTestDatabase()
    const config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
    })
    const placeLinkFetch: typeof fetch = async (input, init) => {
      const url = String(input)
      calls.push({ url, method: init?.method ?? 'GET' })
      const hop = server.get(url)
      if (!hop) return new Response(null, { status: 404 })
      const body = new ReadableStream(
        {
          pull() {
            bodyRead = true
          },
          cancel() {
            bodyCancelled = true
          },
        },
        { highWaterMark: 0 },
      )
      return new Response(body, {
        status: hop.status,
        headers: hop.location ? { location: hop.location } : {},
      })
    }
    const geocodeFetch: typeof fetch = async (input) => {
      const url = new URL(String(input))
      nominatimCalls.push(url.toString())
      const q = url.searchParams.get('q') ?? ''
      if (q.startsWith('explode')) return new Response('down', { status: 500 })
      if (url.pathname.endsWith('/reverse')) {
        return json({
          display_name: 'Kinkakujicho, Kyoto',
          lat: url.searchParams.get('lat'),
          lon: url.searchParams.get('lon'),
          boundingbox: ['35.0', '35.1', '135.7', '135.8'],
        })
      }
      return json(searches[q] ?? [])
    }
    app = await buildApp(db.pool, {
      config,
      now: () => now,
      placeLinkFetch,
      geocodeFetch,
    })
  })

  afterAll(async () => {
    await app.close()
    await db.pool.end()
    await db.drop()
  })

  beforeEach(async () => {
    now = new Date('2026-06-01T00:00:00.000Z')
    server = new Map()
    calls.length = 0
    nominatimCalls.length = 0
    bodyRead = false
    bodyCancelled = false
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

  it('T-33-02 lets a planner in, keeps visitors and strangers out', async () => {
    const { tripId, planner, visitor, stranger } = await setup()
    const ok = await post(planner, tripId, {
      url: 'https://www.google.com/maps',
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ placed: false, lat: null, lng: null })
    expect((await post(visitor, tripId, { url: kinkakuji })).statusCode).toBe(
      403,
    )
    expect((await post(stranger, tripId, { url: kinkakuji })).statusCode).toBe(
      404,
    )
    const anon = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/places/from-link`,
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { url: kinkakuji },
    })
    expect(anon.statusCode).toBe(401)
  })

  it('T-33-02 rejects links that are not Google Maps and finds a URL in text', async () => {
    const { tripId, planner } = await setup()
    for (const body of [
      { url: 'https://example.com/x' },
      { url: 'https://maps.app.goo.gl.evil.com/x' },
      { url: 'https://www.google.com/mail' },
      { text: 'no link here' },
      {},
    ]) {
      const response = await post(planner, tripId, body)
      expect(response.statusCode, JSON.stringify(body)).toBe(400)
      expect(response.json()).toEqual({ error: 'link_not_google_maps' })
    }
    const fromText = await post(planner, tripId, {
      text: 'Look https://www.google.com/maps/@35,135,17z',
    })
    expect(fromText.statusCode).toBe(200)
    const tooLong = await post(planner, tripId, { url: 'x'.repeat(2001) })
    expect(tooLong.statusCode).toBe(400)
    expect(tooLong.json().fields).toEqual({ url: 'invalid' })
  })

  it('T-33-02 answers the 21st request within a minute with 429 and Retry-After', async () => {
    const { tripId, planner } = await setup()
    for (let i = 0; i < 20; i += 1) {
      const response = await post(planner, tripId, {
        url: 'https://www.google.com/maps',
      })
      expect(response.statusCode).toBe(200)
    }
    const limited = await post(planner, tripId, {
      url: 'https://www.google.com/maps',
    })
    expect(limited.statusCode).toBe(429)
    expect(limited.json()).toEqual({ error: 'rate_limited' })
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
    now = new Date(now.getTime() + 61_000)
    const again = await post(planner, tripId, {
      url: 'https://www.google.com/maps',
    })
    expect(again.statusCode).toBe(200)
  })

  it('T-33-03 follows a two-hop short link with HEAD only and reads no body', async () => {
    const { tripId, planner } = await setup()
    server.set('https://maps.app.goo.gl/abc', {
      status: 302,
      location: 'https://goo.gl/maps/def',
    })
    server.set('https://goo.gl/maps/def', {
      status: 302,
      location: 'https://www.google.com/maps/@35.1,135.2,17z',
    })
    const response = await post(planner, tripId, {
      url: 'https://maps.app.goo.gl/abc',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      lat: 35.1,
      lng: 135.2,
      link: 'https://maps.app.goo.gl/abc',
    })
    expect(calls).toEqual([
      { url: 'https://maps.app.goo.gl/abc', method: 'HEAD' },
      { url: 'https://goo.gl/maps/def', method: 'HEAD' },
    ])
    expect(bodyRead).toBe(false)
    expect(bodyCancelled).toBe(true)
  })

  it('T-33-03 uses the continue URL of a consent redirect without requesting it', async () => {
    const { tripId, planner } = await setup()
    const target = 'https://www.google.com/maps/@35.3,135.4,17z'
    server.set('https://maps.app.goo.gl/abc', {
      status: 302,
      location: `https://consent.google.com/m?continue=${encodeURIComponent(target)}&gl=DE`,
    })
    const response = await post(planner, tripId, {
      url: 'https://maps.app.goo.gl/abc',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ lat: 35.3, lng: 135.4 })
    expect(calls.map((call) => call.url)).toEqual([
      'https://maps.app.goo.gl/abc',
    ])
  })

  it('T-33-03 asks with GET (body unread) only when HEAD answers 405', async () => {
    const { tripId, planner } = await setup()
    const url = 'https://maps.app.goo.gl/abc'
    server.set(url, { status: 405 })
    const response = await post(planner, tripId, { url })
    // 405 for both HEAD and GET is a failure, and the GET body is never read.
    expect(response.statusCode).toBe(502)
    expect(calls.map((call) => call.method)).toEqual(['HEAD', 'GET'])
    expect(bodyRead).toBe(false)
  })

  it('T-33-03 answers 502 for a foreign host, six hops and a 500', async () => {
    const { tripId, planner } = await setup()
    server.set('https://maps.app.goo.gl/evil', {
      status: 302,
      location: 'https://example.com/x',
    })
    const foreign = await post(planner, tripId, {
      url: 'https://maps.app.goo.gl/evil',
    })
    expect(foreign.statusCode).toBe(502)
    expect(foreign.json()).toEqual({ error: 'link_resolve_failed' })
    expect(calls.map((call) => call.url)).toEqual([
      'https://maps.app.goo.gl/evil',
    ])

    for (let i = 0; i < 6; i += 1) {
      server.set(`https://goo.gl/maps/h${i}`, {
        status: 302,
        location: `https://goo.gl/maps/h${i + 1}`,
      })
    }
    calls.length = 0
    const loop = await post(planner, tripId, { url: 'https://goo.gl/maps/h0' })
    expect(loop.statusCode).toBe(502)
    expect(calls).toHaveLength(5)

    server.set('https://maps.app.goo.gl/boom', { status: 500 })
    const boom = await post(planner, tripId, {
      url: 'https://maps.app.goo.gl/boom',
    })
    expect(boom.statusCode).toBe(502)
    expect(boom.json()).toEqual({ error: 'link_resolve_failed' })
  })

  it('T-33-03 gives up after 5 s of a hanging server', async () => {
    vi.useFakeTimers()
    try {
      const hanging: typeof fetch = (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          )
        })
      const result = resolveShortLink('https://maps.app.goo.gl/abc', hanging)
      const outcome = result.then(
        () => 'resolved',
        (error: unknown) => error,
      )
      await vi.advanceTimersByTimeAsync(6000)
      expect(await outcome).toBeInstanceOf(LinkResolveError)
    } finally {
      vi.useRealTimers()
    }
  })

  it('T-33-04 prefers the Nominatim point within 300 m of the link', async () => {
    const { tripId, planner } = await setup()
    const response = await post(planner, tripId, { url: kinkakuji })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      title: 'Kinkaku-ji',
      address: 'Kinkaku-ji, Kita Ward, Kyoto',
      lat: 35.0398,
      lng: 135.7292,
      link: kinkakuji,
      placed: true,
    })
  })

  it('T-33-04 skips a first hit 2 km away and takes the one within 300 m', async () => {
    const { tripId, planner } = await setup()
    const response = await post(planner, tripId, {
      url: 'https://www.google.com/maps/place/Ryoan-ji/@35.0394,135.7292,17z',
    })
    expect(response.json()).toMatchObject({
      address: 'Ryoan-ji, Kyoto',
      lat: 35.0397,
      lng: 135.7295,
      placed: true,
    })
  })

  it('T-33-04 falls back to the link point and its reverse-geocoded address', async () => {
    const { tripId, planner } = await setup()
    const response = await post(planner, tripId, {
      url: 'https://www.google.com/maps/place/Nowhere/@35.5,135.5,17z',
    })
    expect(response.json()).toMatchObject({
      title: 'Nowhere',
      address: 'Kinkakujicho, Kyoto',
      lat: 35.5,
      lng: 135.5,
      placed: true,
    })
  })

  it('T-33-04 uses the first hit inside the trip box for a link without a point', async () => {
    const { tripId, planner } = await setup()
    const response = await post(planner, tripId, {
      url: 'https://www.google.com/maps?q=Ichiran+Shibuya',
    })
    expect(response.json()).toMatchObject({
      title: 'Ichiran Shibuya',
      address: 'Ichiran Shibuya, Tokyo',
      lat: 35.659,
      lng: 139.7,
      placed: true,
    })
  })

  it('T-33-04 reports placed false with nulls when nothing is found', async () => {
    const { tripId, planner } = await setup()
    const url = 'https://www.google.com/maps?q=Zzz'
    const response = await post(planner, tripId, { url })
    expect(response.json()).toEqual({
      title: 'Zzz',
      address: null,
      lat: null,
      lng: null,
      link: url,
      placed: false,
    })
  })

  it('T-33-04 replaces a 600-character link by the api=1 search URL', async () => {
    const { tripId, planner } = await setup()
    const url = `${kinkakuji}?${'a=b&'.repeat(150)}`
    expect(url.length).toBeGreaterThan(500)
    const response = await post(planner, tripId, { url })
    const body = response.json()
    expect(body.placed).toBe(true)
    expect(body.link).toBe(
      'https://www.google.com/maps/search/?api=1&query=35.0398,135.7292',
    )
  })

  it('T-33-04 keeps the link point with no address while Nominatim is down', async () => {
    const { tripId, planner } = await setup()
    const response = await post(planner, tripId, {
      url: 'https://www.google.com/maps/place/explode/@35.2,135.3,17z',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      title: 'explode',
      address: null,
      lat: 35.2,
      lng: 135.3,
      placed: true,
    })
  })

  async function setup() {
    const planner = await login('100000000000003301')
    const visitor = await login('100000000000003302')
    const stranger = await login('100000000000003303')
    const created = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: jsonHeaders(planner.cookie),
      payload: japan,
    })
    expect(created.statusCode).toBe(201)
    const tripId = created.json().id as string
    // The creator is the owner; the second user becomes a visitor.
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'visitor')`,
      [tripId, visitor.user.id],
    )
    return { tripId, planner, visitor, stranger }
  }

  function post(
    who: { cookie: string },
    tripId: string,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: 'POST',
      url: `/trips/${tripId}/places/from-link`,
      headers: jsonHeaders(who.cookie),
      payload,
    })
  }

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
      user: response.json() as { id: string },
    }
  }
})

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function jsonHeaders(cookie: string) {
  return { cookie, origin: WEB_ORIGIN, 'content-type': 'application/json' }
}

function sessionHeader(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  const cookie = list.find((value) => value.startsWith('tb_session=')) ?? ''
  const pair = cookie.split(';')[0] ?? ''
  return `tb_session=${pair.slice(pair.indexOf('=') + 1)}`
}
