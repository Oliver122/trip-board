import { activity } from '../activity/record.js'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import type { FastifyInstance } from 'fastify'
import type { LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const WEB_ORIGIN = 'http://127.0.0.1:5180'

const honshu = {
  name: 'Honshu',
  timezone: 'Asia/Tokyo',
  region: {
    bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 },
  },
}

describe('live events', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig
  let base: string
  const logs: string[] = []

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
      logStream: { write: (message) => logs.push(message) },
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
    logs.length = 0
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

  it('T-19-01 a member gets an event stream, others do not', async () => {
    const owner = await login('100000000000000191')
    const stranger = await login('100000000000000192')
    const tripId = await createTrip(owner.cookie)

    const missing = await fetch(`${base}/trips/${tripId}/events`)
    expect(missing.status).toBe(401)

    const outsider = await fetch(`${base}/trips/${tripId}/events`, {
      headers: { cookie: stranger.cookie },
    })
    expect(outsider.status).toBe(404)

    const stream = await fetch(`${base}/trips/${tripId}/events`, {
      headers: { cookie: owner.cookie },
    })
    expect(stream.status).toBe(200)
    expect(stream.headers.get('content-type')).toContain('text/event-stream')
    expect(stream.headers.get('x-accel-buffering')).toBe('no')
    await stream.body?.cancel()
  })

  it('T-19-02 a committed spot update is one change event, a rollback is none', async () => {
    const owner = await login('100000000000000193')
    const member = await login('100000000000000194')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, member.user.id, 'planner')
    const created = await postSpot(owner.cookie, tripId)
    const spotId = created.json().id as string
    const rolled = '00000000-0000-0000-0000-00000000dead'

    const stream = await fetch(`${base}/trips/${tripId}/events`, {
      headers: { cookie: member.cookie },
    })
    expect(stream.status).toBe(200)
    const pending = track(stream)

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      await activity.record(client, {
        actor: owner.user.id,
        trip: tripId,
        action: 'spot.update',
        entityId: rolled,
        metadata: { spot: 'rolled-back' },
      })
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }

    const patched = await app.inject({
      method: 'PATCH',
      url: `/spots/${spotId}`,
      headers: {
        ...jsonHeaders(owner.cookie),
        'x-client-id': 'tab-a',
      },
      payload: { title: 'Tokyo Station' },
    })
    expect(patched.statusCode).toBe(200)

    const text = await pending.wait(
      (body) => body.includes(spotId) && body.includes('event: change'),
      4000,
    )
    expect(text).not.toContain(rolled)
    expect(text).toContain('"resource":"spot"')
    expect(text).toContain(`"id":"${spotId}"`)
    expect(text).toContain('"clientId":"tab-a"')
    const changes = text.split('event: change').length - 1
    expect(changes).toBe(1)
    await pending.cancel()
  })

  it('T-19-03 removing a member notifies the others and closes that stream', async () => {
    const owner = await login('100000000000000195')
    const member = await login('100000000000000196')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, member.user.id, 'planner')

    const memberStream = await fetch(`${base}/trips/${tripId}/events`, {
      headers: { cookie: member.cookie },
    })
    const ownerStream = await fetch(`${base}/trips/${tripId}/events`, {
      headers: { cookie: owner.cookie },
    })
    expect(memberStream.status).toBe(200)
    const ownerText = track(ownerStream)
    const memberDone = readToEnd(memberStream)

    const removed = await app.inject({
      method: 'DELETE',
      url: `/trips/${tripId}/members/${member.user.id}`,
      headers: writeHeaders(owner.cookie),
    })
    expect(removed.statusCode).toBe(204)
    expect(
      await ownerText.wait(
        (text) => text.includes('"resource":"member"'),
        4000,
      ),
    ).toContain('"action":"member.remove"')
    expect(await memberDone).toBe(true)
    await ownerText.cancel()
  })

  it('T-19-04 the sixth stream is rejected and logout closes the open ones', async () => {
    const owner = await login('100000000000000197')
    const tripId = await createTrip(owner.cookie)
    const streams = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${base}/trips/${tripId}/events`, {
          headers: { cookie: owner.cookie },
        }),
      ),
    )
    for (const stream of streams) expect(stream.status).toBe(200)
    const sixth = await fetch(`${base}/trips/${tripId}/events`, {
      headers: { cookie: owner.cookie },
    })
    expect(sixth.status).toBe(429)

    const closed = streams[0] ? readToEnd(streams[0]) : Promise.resolve(false)
    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: writeHeaders(owner.cookie),
    })
    expect(logout.statusCode).toBe(204)
    expect(await closed).toBe(true)
    await Promise.all(streams.slice(1).map((stream) => stream.body?.cancel()))
  })

  it('T-19-05 Last-Event-ID and a dropped listener both resync', async () => {
    const owner = await login('100000000000000198')
    const tripId = await createTrip(owner.cookie)
    const stream = await fetch(`${base}/trips/${tripId}/events`, {
      headers: { cookie: owner.cookie, 'last-event-id': '4' },
    })
    expect(stream.status).toBe(200)
    const live = track(stream)
    const first = await live.wait(
      (text) => text.includes('event: resync'),
      2000,
    )
    expect(first).toContain('event: resync')

    app.tripHub.disconnectListener()
    const second = await live.wait(
      (text) => text.split('event: resync').length >= 3,
      4000,
    )
    expect(second.split('event: resync').length).toBeGreaterThanOrEqual(3)
    expect(logs.join('\n')).toContain('trip events listener reconnecting')
    await live.cancel()
  })

  it('T-19-06 a stale expectedUpdatedAt conflicts and a blind write does not', async () => {
    const owner = await login('100000000000000199')
    const tripId = await createTrip(owner.cookie)
    const created = await postSpot(owner.cookie, tripId)
    const spot = created.json() as { id: string; updatedAt: string }
    const first = await app.inject({
      method: 'PATCH',
      url: `/spots/${spot.id}`,
      headers: jsonHeaders(owner.cookie),
      payload: { title: 'Aiko edit', expectedUpdatedAt: spot.updatedAt },
    })
    expect(first.statusCode).toBe(200)
    const stale = await app.inject({
      method: 'PATCH',
      url: `/spots/${spot.id}`,
      headers: jsonHeaders(owner.cookie),
      payload: { title: 'Sven edit', expectedUpdatedAt: spot.updatedAt },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({
      error: 'conflict',
      current: { id: spot.id, title: 'Aiko edit' },
      updatedBy: { id: owner.user.id, name: owner.user.username },
    })
    const blind = await app.inject({
      method: 'PATCH',
      url: `/spots/${spot.id}`,
      headers: jsonHeaders(owner.cookie),
      payload: { title: 'Sven edit' },
    })
    expect(blind.statusCode).toBe(200)
    expect(blind.json().title).toBe('Sven edit')
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

  function postSpot(cookie: string, tripId: string) {
    return app.inject({
      method: 'POST',
      url: `/trips/${tripId}/spots`,
      headers: jsonHeaders(cookie),
      payload: {
        title: 'Tokyo Station',
        lat: 35.6812,
        lng: 139.7671,
        baseCategory: 'must_go',
      },
    })
  }
})

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

async function readToEnd(response: Response): Promise<boolean> {
  const reader = response.body?.getReader()
  if (!reader) return false
  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => {
      void reader.cancel()
      resolve(false)
    }, 4000)
  })
  const reading = (async () => {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return true
    }
  })()
  return Promise.race([reading, timeout])
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
