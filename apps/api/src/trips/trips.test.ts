import type { LightMyRequestResponse } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { activity } from '../activity/record.js'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { withTransaction } from '../db/transaction.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'

const japan = {
  name: 'Japan 2026',
  timezone: 'Asia/Tokyo',
  startDate: '2026-04-01',
  endDate: '2026-04-14',
  region: {
    bbox: { minLng: 122.94, minLat: 24.4, maxLng: 145.82, maxLat: 45.55 },
  },
}

describe('trips', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig
  const now = new Date('2026-06-01T00:00:00.000Z')

  beforeAll(async () => {
    db = await createTestDatabase()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
    })
    app = await buildApp(db.pool, { config, now: () => now })
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

  it('T-04-01 creates the trip, owner membership, and created_by', async () => {
    const owner = await login('100000000000000411')
    const response = await postTrip(owner.cookie, japan)
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body).toMatchObject({
      name: 'Japan 2026',
      role: 'owner',
      memberCount: 1,
      createdByName: owner.user.username,
      startDate: '2026-04-01',
      endDate: '2026-04-14',
      timezone: 'Asia/Tokyo',
      region: japan.region,
    })
    expect(body.members).toEqual([
      {
        id: owner.user.id,
        name: owner.user.username,
        avatarUrl: null,
      },
    ])

    const trip = await db.pool.query<{ created_by: string }>(
      'SELECT created_by FROM trips WHERE id = $1',
      [body.id],
    )
    expect(trip.rows[0]?.created_by).toBe(owner.user.id)
    const member = await db.pool.query<{ role: string }>(
      'SELECT role FROM trip_members WHERE trip_id = $1 AND user_id = $2',
      [body.id, owner.user.id],
    )
    expect(member.rows).toEqual([{ role: 'owner' }])
  })

  it('T-04-02 rejects an empty name, reversed dates, and an inverted bbox', async () => {
    const owner = await login('100000000000000411')
    const response = await postTrip(owner.cookie, {
      name: '   ',
      timezone: 'Asia/Tokyo',
      startDate: '2026-05-02',
      endDate: '2026-05-01',
      region: { bbox: { minLng: 10, minLat: 10, maxLng: 0, maxLat: 0 } },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().fields).toMatchObject({
      name: 'empty',
      endDate: 'before_start',
      'region.bbox': 'min_greater_than_max',
    })

    const zone = await postTrip(owner.cookie, {
      ...japan,
      timezone: 'Mars/Olympus',
    })
    expect(zone.statusCode).toBe(400)
    expect(zone.json().fields.timezone).toBe('invalid')

    const created = await postTrip(owner.cookie, japan)
    const patched = await app.inject({
      method: 'PATCH',
      url: `/trips/${created.json().id}`,
      headers: jsonHeaders(owner.cookie),
      payload: { endDate: '2026-03-01' },
    })
    expect(patched.statusCode).toBe(400)
    expect(patched.json().fields.endDate).toBe('before_start')
  })

  it('T-04-03 lists only the caller trips and the role on each', async () => {
    const owner = await login('100000000000000411')
    const planner = await login('100000000000000412')
    const stranger = await login('100000000000000413')
    const created = await postTrip(owner.cookie, japan)
    const tripId = created.json().id as string
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'planner')`,
      [tripId, planner.user.id],
    )
    await postTrip(stranger.cookie, {
      ...japan,
      name: 'France 2026',
      timezone: 'Europe/Paris',
    })

    const ownerList = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { cookie: owner.cookie },
    })
    expect(ownerList.statusCode).toBe(200)
    expect(ownerList.json().trips).toMatchObject([
      {
        id: tripId,
        role: 'owner',
        memberCount: 2,
        createdByName: owner.user.username,
        startDate: '2026-04-01',
        endDate: '2026-04-14',
      },
    ])

    const plannerList = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { cookie: planner.cookie },
    })
    expect(plannerList.json().trips).toMatchObject([
      { id: tripId, role: 'planner', memberCount: 2 },
    ])

    const strangerList = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { cookie: stranger.cookie },
    })
    expect(strangerList.json().trips).toHaveLength(1)
    expect(strangerList.json().trips[0].name).toBe('France 2026')
    expect(strangerList.json().trips[0].role).toBe('owner')
  })

  it('T-04-04 hides a trip from anyone who is not a member', async () => {
    const owner = await login('100000000000000411')
    const stranger = await login('100000000000000412')
    const created = await postTrip(owner.cookie, japan)
    const tripId = created.json().id as string

    const hidden = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}`,
      headers: { cookie: stranger.cookie },
    })
    expect(hidden.statusCode).toBe(404)
    expect(hidden.json()).toEqual({ error: 'not_found' })
    expect(JSON.stringify(hidden.json())).not.toContain('Japan')

    const missing = await app.inject({
      method: 'GET',
      url: '/trips/00000000-0000-4000-8000-000000000099',
      headers: { cookie: owner.cookie },
    })
    expect(missing.statusCode).toBe(404)

    const patched = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}`,
      headers: jsonHeaders(stranger.cookie),
      payload: { name: 'Stolen' },
    })
    expect(patched.statusCode).toBe(404)
  })

  it('T-04-05 lets planners edit and only the owner delete', async () => {
    const owner = await login('100000000000000411')
    const planner = await login('100000000000000412')
    const visitor = await login('100000000000000413')
    const created = await postTrip(owner.cookie, japan)
    const tripId = created.json().id as string
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'planner'), ($1, $3, 'visitor')`,
      [tripId, planner.user.id, visitor.user.id],
    )

    const plannerPatch = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}`,
      headers: jsonHeaders(planner.cookie),
      payload: { name: 'Japan 2027' },
    })
    expect(plannerPatch.statusCode).toBe(200)
    expect(plannerPatch.json().name).toBe('Japan 2027')

    const visitorPatch = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}`,
      headers: jsonHeaders(visitor.cookie),
      payload: { name: 'Nope' },
    })
    expect(visitorPatch.statusCode).toBe(403)
    expect(visitorPatch.json()).toEqual({ error: 'forbidden' })

    const ownerPatch = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}`,
      headers: jsonHeaders(owner.cookie),
      payload: {
        startDate: '2026-04-02',
        region: {
          bbox: { minLng: 120, minLat: 20, maxLng: 150, maxLat: 50 },
        },
      },
    })
    expect(ownerPatch.statusCode).toBe(200)
    expect(ownerPatch.json().startDate).toBe('2026-04-02')
    expect(ownerPatch.json().region.bbox.minLng).toBe(120)

    const plannerDelete = await app.inject({
      method: 'DELETE',
      url: `/trips/${tripId}`,
      headers: writeHeaders(planner.cookie),
    })
    expect(plannerDelete.statusCode).toBe(403)
    const stillThere = await db.pool.query(
      'SELECT id FROM trips WHERE id = $1',
      [tripId],
    )
    expect(stillThere.rows).toHaveLength(1)

    const ownerDelete = await app.inject({
      method: 'DELETE',
      url: `/trips/${tripId}`,
      headers: writeHeaders(owner.cookie),
    })
    expect(ownerDelete.statusCode).toBe(204)
    const gone = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}`,
      headers: { cookie: owner.cookie },
    })
    expect(gone.statusCode).toBe(404)
  })

  it('T-28-05 a new trip gets Must go and Maybe, and none without the trip', async () => {
    const owner = await login('100000000000002805')
    const created = await postTrip(owner.cookie, japan)
    expect(created.statusCode).toBe(201)
    const kinds = await db.pool.query(
      `
      SELECT name, preset, color, symbol, sort_order
      FROM spot_kinds WHERE trip_id = $1 ORDER BY sort_order
      `,
      [created.json().id],
    )
    expect(kinds.rows).toEqual([
      {
        name: null,
        preset: 'must_go',
        color: '#E5484D',
        symbol: 'exclamation',
        sort_order: 0,
      },
      {
        name: null,
        preset: 'maybe',
        color: '#30A46C',
        symbol: 'question',
        sort_order: 1,
      },
    ])

    // A failing trip insert leaves no kind rows behind.
    const before = await db.pool.query(
      'SELECT count(*)::int AS n FROM spot_kinds',
    )
    const failed = await postTrip(owner.cookie, {
      ...japan,
      name: 'x'.repeat(5000),
    })
    expect(failed.statusCode).toBe(400)
    await db.pool.query(
      `CREATE FUNCTION fail_trip_member() RETURNS trigger LANGUAGE plpgsql AS
         $$ BEGIN RAISE EXCEPTION 'boom'; END $$;
       CREATE TRIGGER fail_trip_member BEFORE INSERT ON trip_members
         FOR EACH ROW EXECUTE FUNCTION fail_trip_member();`,
    )
    try {
      const broken = await postTrip(owner.cookie, japan)
      expect(broken.statusCode).toBe(500)
    } finally {
      await db.pool.query(
        'DROP TRIGGER fail_trip_member ON trip_members; DROP FUNCTION fail_trip_member()',
      )
    }
    const after = await db.pool.query(
      'SELECT count(*)::int AS n FROM spot_kinds',
    )
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n)
  })

  it('T-28-05 shows the admin role in the trip list and detail', async () => {
    const owner = await login('100000000000002806')
    const admin = await login('100000000000002807')
    const created = await postTrip(owner.cookie, japan)
    const tripId = created.json().id as string
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'admin')`,
      [tripId, admin.user.id],
    )
    const detail = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}`,
      headers: { cookie: admin.cookie },
    })
    expect(detail.json().role).toBe('admin')
    const listed = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { cookie: admin.cookie },
    })
    expect(listed.json().trips[0].role).toBe('admin')
  })

  it('T-04-06 cascades spots, plans, and members and queues image blobs', async () => {
    const owner = await login('100000000000000411')
    const created = await postTrip(owner.cookie, japan)
    const tripId = created.json().id as string
    const spot = await db.pool.query<{ id: string }>(
      `
      INSERT INTO spots (trip_id, title, lat, lng, base_category, created_by)
      VALUES ($1, 'Shibuya', 35.66, 139.7, 'home', $2)
      RETURNING id
      `,
      [tripId, owner.user.id],
    )
    const spotId = spot.rows[0]?.id
    await db.pool.query(
      `
      INSERT INTO images (trip_id, spot_id, uploaded_by, storage_key, bytes, width, height)
      VALUES ($1, $2, $3, 'trips/test/a.webp', 1200, 64, 64)
      `,
      [tripId, spotId, owner.user.id],
    )
    const plan = await db.pool.query<{ id: string }>(
      `
      INSERT INTO plan_entries (trip_id, type, title, start_date, end_date, created_by)
      VALUES ($1, 'bucket', 'Week 1', '2026-04-01', '2026-04-07', $2)
      RETURNING id
      `,
      [tripId, owner.user.id],
    )
    await db.pool.query(
      `
      INSERT INTO plan_entry_spots (trip_id, plan_entry_id, spot_id)
      VALUES ($1, $2, $3)
      `,
      [tripId, plan.rows[0]?.id, spotId],
    )

    const response = await app.inject({
      method: 'DELETE',
      url: `/trips/${tripId}`,
      headers: writeHeaders(owner.cookie),
    })
    expect(response.statusCode).toBe(204)
    const left = await db.pool.query<{
      spots: number
      plans: number
      links: number
      members: number
      trips: number
    }>(
      `
      SELECT
        (SELECT count(*)::int FROM spots WHERE trip_id = $1) AS spots,
        (SELECT count(*)::int FROM plan_entries WHERE trip_id = $1) AS plans,
        (SELECT count(*)::int FROM plan_entry_spots WHERE trip_id = $1) AS links,
        (SELECT count(*)::int FROM trip_members WHERE trip_id = $1) AS members,
        (SELECT count(*)::int FROM trips WHERE id = $1) AS trips
      `,
      [tripId],
    )
    expect(left.rows[0]).toEqual({
      spots: 0,
      plans: 0,
      links: 0,
      members: 0,
      trips: 0,
    })
    const blobs = await db.pool.query<{ storage_key: string }>(
      'SELECT storage_key FROM blob_deletions',
    )
    expect(blobs.rows).toEqual([{ storage_key: 'trips/test/a.webp' }])
  })

  it('T-04-10 records one event per write and rolls the event back with the trip', async () => {
    const owner = await login('100000000000000411')
    const created = await postTrip(owner.cookie, japan)
    const tripId = created.json().id as string
    await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}`,
      headers: jsonHeaders(owner.cookie),
      payload: { name: 'Japan 2027' },
    })

    await expect(
      withTransaction(db.pool, async (tx) => {
        await activity.record(tx, {
          actor: owner.user.id,
          trip: tripId,
          action: 'trip.update',
          entityId: tripId,
          metadata: { trip: 'Should not stick' },
        })
        await tx.query(
          'UPDATE trips SET bbox_min_lng = 20, bbox_max_lng = 10 WHERE id = $1',
          [tripId],
        )
      }),
    ).rejects.toThrow()

    const doomed = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM activity_events WHERE metadata->>'trip' = 'Should not stick'`,
    )
    expect(doomed.rows[0]?.n).toBe(0)
    const unchanged = await db.pool.query<{
      name: string
      bbox_min_lng: number
    }>('SELECT name, bbox_min_lng FROM trips WHERE id = $1', [tripId])
    expect(unchanged.rows[0]).toMatchObject({
      name: 'Japan 2027',
      bbox_min_lng: japan.region.bbox.minLng,
    })

    const removed = await app.inject({
      method: 'DELETE',
      url: `/trips/${tripId}`,
      headers: writeHeaders(owner.cookie),
    })
    expect(removed.statusCode).toBe(204)

    const events = await db.pool.query<{
      action: string
      trip: string
      trip_id: string | null
    }>(
      `
      SELECT action, metadata->>'trip' AS trip, trip_id
      FROM activity_events
      WHERE action LIKE 'trip.%'
      ORDER BY id
      `,
    )
    expect(events.rows).toEqual([
      { action: 'trip.create', trip: 'Japan 2026', trip_id: null },
      { action: 'trip.update', trip: 'Japan 2027', trip_id: null },
      { action: 'trip.delete', trip: 'Japan 2027', trip_id: null },
    ])
  })

  it('rejects anonymous callers and a foreign origin', async () => {
    const owner = await login('100000000000000411')
    const created = await postTrip(owner.cookie, japan)
    const tripId = created.json().id as string

    for (const url of ['/trips', `/trips/${tripId}`]) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode).toBe(401)
    }
    const posted = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'content-type': 'application/json' },
      payload: japan,
    })
    expect(posted.statusCode).toBe(401)
    const foreign = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: {
        cookie: owner.cookie,
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      payload: japan,
    })
    expect(foreign.statusCode).toBe(403)
    const badId = await app.inject({
      method: 'GET',
      url: '/trips/not-a-uuid',
      headers: { cookie: owner.cookie },
    })
    expect(badId.statusCode).toBe(400)
    expect(badId.json().fields.id).toBe('invalid')
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

  function postTrip(cookie: string, payload: object) {
    return app.inject({
      method: 'POST',
      url: '/trips',
      headers: jsonHeaders(cookie),
      payload,
    })
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
  return `tb_session=${cookieValue(cookie ?? '')}`
}
