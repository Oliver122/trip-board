import type { LightMyRequestResponse } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { seedDatabase } from '../db/seed.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'
const seedTrip = '10000000-0000-0000-0000-000000000001'

const honshu = {
  name: 'Honshu',
  timezone: 'Asia/Tokyo',
  region: {
    bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 },
  },
}

const tokyo = {
  title: 'Tokyo Station',
  lat: 35.6812,
  lng: 139.7671,
  baseCategory: 'must_go',
  address: '1 Chome Marunouchi, Chiyoda',
  info: 'Opens at 12',
  link: 'https://example.com/tokyo',
}

describe('spots', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig

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

  it('T-06-01 creates a spot and lists it with display category and creator', async () => {
    const owner = await login('100000000000000611')
    const visitor = await login('100000000000000612')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, visitor.user.id, 'visitor')

    const created = await postSpot(owner.cookie, tripId, tokyo)
    expect(created.statusCode).toBe(201)
    const spot = created.json()
    expect(spot).toMatchObject({
      tripId,
      title: 'Tokyo Station',
      address: tokyo.address,
      lat: tokyo.lat,
      lng: tokyo.lng,
      baseCategory: 'must_go',
      displayCategory: 'must_go',
      planCount: 0,
      firstScheduledAt: null,
      info: tokyo.info,
      link: tokyo.link,
      createdBy: {
        id: owner.user.id,
        name: owner.user.username,
        avatar: null,
      },
    })

    const listed = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}/spots`,
      headers: { cookie: visitor.cookie },
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().spots).toEqual([spot])

    const one = await app.inject({
      method: 'GET',
      url: `/spots/${spot.id}`,
      headers: { cookie: visitor.cookie },
    })
    expect(one.statusCode).toBe(200)
    expect(one.json()).toEqual({ ...spot, plans: [] })

    const events = await db.pool.query<{ action: string; spot: string }>(
      `SELECT action, metadata->>'spot' AS spot FROM activity_events ORDER BY id`,
    )
    expect(events.rows).toContainEqual({
      action: 'spot.create',
      spot: 'Tokyo Station',
    })
  })

  it('T-06-02 enforces the role matrix for create, update, and delete', async () => {
    const owner = await login('100000000000000621')
    const planner = await login('100000000000000622')
    const visitor = await login('100000000000000623')
    const stranger = await login('100000000000000624')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, planner.user.id, 'planner')
    await addMember(tripId, visitor.user.id, 'visitor')

    const owned = await postSpot(owner.cookie, tripId, tokyo)
    expect(owned.statusCode).toBe(201)
    const ownedId = owned.json().id as string
    const planned = await postSpot(planner.cookie, tripId, {
      ...tokyo,
      title: 'Planner spot',
      baseCategory: 'maybe',
    })
    expect(planned.statusCode).toBe(201)
    const plannedId = planned.json().id as string

    expect((await postSpot(visitor.cookie, tripId, tokyo)).statusCode).toBe(403)
    expect((await postSpot(stranger.cookie, tripId, tokyo)).statusCode).toBe(
      404,
    )

    const plannerPatch = await patchSpot(planner.cookie, ownedId, {
      title: 'Tokyo updated',
    })
    expect(plannerPatch.statusCode).toBe(200)
    expect(plannerPatch.json().title).toBe('Tokyo updated')
    expect(
      (await patchSpot(visitor.cookie, ownedId, { title: 'Nope' })).statusCode,
    ).toBe(403)
    expect(
      (await patchSpot(stranger.cookie, ownedId, { title: 'Nope' })).statusCode,
    ).toBe(404)
    const ownerPatch = await patchSpot(owner.cookie, ownedId, {
      info: 'Updated by owner',
    })
    expect(ownerPatch.statusCode).toBe(200)

    expect((await deleteSpot(visitor.cookie, ownedId)).statusCode).toBe(403)
    expect((await deleteSpot(stranger.cookie, ownedId)).statusCode).toBe(404)
    expect((await deleteSpot(planner.cookie, plannedId)).statusCode).toBe(204)
    expect((await deleteSpot(owner.cookie, ownedId)).statusCode).toBe(204)

    const gone = await app.inject({
      method: 'GET',
      url: `/spots/${ownedId}`,
      headers: { cookie: owner.cookie },
    })
    expect(gone.statusCode).toBe(404)

    const actions = await db.pool.query<{ action: string }>(
      `SELECT action FROM activity_events WHERE action LIKE 'spot.%' ORDER BY id`,
    )
    expect(actions.rows.map((row) => row.action)).toEqual([
      'spot.create',
      'spot.create',
      'spot.update',
      'spot.update',
      'spot.delete',
      'spot.delete',
    ])
  })

  it('T-06-03 hides a spot from a member of a different trip', async () => {
    const owner = await login('100000000000000631')
    const other = await login('100000000000000632')
    const tripId = await createTrip(owner.cookie)
    await createTrip(other.cookie, { ...honshu, name: 'Other' })
    const created = await postSpot(owner.cookie, tripId, tokyo)
    const spotId = created.json().id as string

    for (const call of [
      app.inject({
        method: 'GET',
        url: `/spots/${spotId}`,
        headers: { cookie: other.cookie },
      }),
      app.inject({
        method: 'PATCH',
        url: `/spots/${spotId}`,
        headers: jsonHeaders(other.cookie),
        payload: { title: 'Stolen' },
      }),
      app.inject({
        method: 'DELETE',
        url: `/spots/${spotId}`,
        headers: writeHeaders(other.cookie),
      }),
      app.inject({
        method: 'GET',
        url: `/trips/${tripId}/spots`,
        headers: { cookie: other.cookie },
      }),
    ]) {
      const response = await call
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'not_found' })
    }
  })

  it('T-06-04 rejects planned as an input category', async () => {
    const owner = await login('100000000000000641')
    const tripId = await createTrip(owner.cookie)
    const created = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      baseCategory: 'planned',
    })
    expect(created.statusCode).toBe(400)
    expect(created.json().fields.baseCategory).toBe('planned_automatic')

    const spot = await postSpot(owner.cookie, tripId, tokyo)
    const patched = await patchSpot(owner.cookie, spot.json().id, {
      baseCategory: 'planned',
    })
    expect(patched.statusCode).toBe(400)
    expect(patched.json().fields.baseCategory).toBe('planned_automatic')
  })

  it('T-06-05 expands the bbox for Okinawa and leaves an inside spot unchanged', async () => {
    const owner = await login('100000000000000651')
    const tripId = await createTrip(owner.cookie)
    const inside = await postSpot(owner.cookie, tripId, tokyo)
    expect(inside.statusCode).toBe(201)
    expect(await tripBBox(owner.cookie, tripId)).toEqual(honshu.region.bbox)

    const outside = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'Naha',
      lat: 26.2124,
      lng: 127.6809,
      baseCategory: 'maybe',
    })
    expect(outside.statusCode).toBe(201)
    const bbox = await tripBBox(owner.cookie, tripId)
    expect(bbox.minLng).toBeCloseTo(126.24899, 4)
    expect(bbox.minLat).toBeCloseTo(24.73364, 4)
    expect(bbox.maxLng).toBeCloseTo(143.43191, 4)
    expect(bbox.maxLat).toBeCloseTo(42.47876, 4)
    expect(bbox.minLng).toBeLessThan(127.6809)
    expect(bbox.minLat).toBeLessThan(26.2124)
  })

  it('T-06-06 rejects a javascript link, a 121-character title, and lat 91', async () => {
    const owner = await login('100000000000000661')
    const tripId = await createTrip(owner.cookie)

    const link = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      link: 'javascript:alert(1)',
    })
    expect(link.statusCode).toBe(400)
    expect(link.json().fields.link).toBe('invalid')

    const title = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'a'.repeat(121),
    })
    expect(title.statusCode).toBe(400)
    expect(title.json().fields.title).toBe('too_long')

    const lat = await postSpot(owner.cookie, tripId, { ...tokyo, lat: 91 })
    expect(lat.statusCode).toBe(400)
    expect(lat.json().fields.lat).toBe('invalid')
  })

  it('T-18-02 stores a schemeless link as https on create and patch', async () => {
    const owner = await login('100000000000000662')
    const tripId = await createTrip(owner.cookie)
    const created = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      link: 'hotel.jp',
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().link).toBe('https://hotel.jp')

    const patched = await patchSpot(owner.cookie, created.json().id, {
      link: 'maps.google.com/xyz',
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().link).toBe('https://maps.google.com/xyz')
  })

  it('T-09-01 searches title, address, and info without treating % as a wildcard', async () => {
    const owner = await login('100000000000000691')
    const tripId = await createTrip(owner.cookie)
    await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'Fushimi Inari',
      address: 'Kyoto',
      info: null,
    })
    await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'Cafe',
      info: 'öffnet um 12',
    })
    await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: '100%',
      info: null,
    })

    const inari = await list(owner.cookie, tripId, 'q=inari')
    expect(inari.statusCode).toBe(200)
    expect(titles(inari)).toEqual(['Fushimi Inari'])

    const umlaut = await list(owner.cookie, tripId, 'q=ÖFFNET')
    expect(umlaut.statusCode).toBe(200)
    expect(titles(umlaut)).toEqual(['Cafe'])

    const literal = await list(owner.cookie, tripId, 'q=%')
    expect(literal.statusCode).toBe(200)
    expect(titles(literal)).toEqual(['100%'])
    expect(literal.json().total).toBe(3)
  })

  it('T-09-02 filters by display category, schedule, and creator', async () => {
    const owner = await login('100000000000000692')
    const friend = await login('100000000000000693')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, friend.user.id, 'planner')
    const mustGo = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'Must Go Cafe',
      baseCategory: 'must_go',
    })
    const home = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'Home Hotel',
      baseCategory: 'home',
    })
    await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'Maybe Park',
      baseCategory: 'maybe',
    })
    const planned = await postSpot(friend.cookie, tripId, {
      ...tokyo,
      title: 'Planned Tower',
      baseCategory: 'must_go',
    })
    await scheduleSpot(tripId, planned.json().id as string, friend.user.id)

    const categories = await list(owner.cookie, tripId, 'cat=must_go,home')
    expect(categories.statusCode).toBe(200)
    expect(titles(categories)).toEqual(['Must Go Cafe', 'Home Hotel'])
    expect(
      categories
        .json()
        .spots.map((spot: { displayCategory: string }) => spot.displayCategory),
    ).toEqual(['must_go', 'home'])
    expect(categories.json().total).toBe(4)

    const scheduled = await list(owner.cookie, tripId, 'status=scheduled')
    expect(scheduled.statusCode).toBe(200)
    expect(titles(scheduled)).toEqual(['Planned Tower'])
    expect(scheduled.json().spots[0].planCount).toBeGreaterThan(0)

    const byFriend = await list(owner.cookie, tripId, `by=${friend.user.id}`)
    expect(titles(byFriend)).toEqual(['Planned Tower'])

    expect(mustGo.statusCode).toBe(201)
    expect(home.statusCode).toBe(201)
  })

  it('filters spots linked to one plan entry', async () => {
    const owner = await login('100000000000000811')
    const tripId = await createTrip(owner.cookie)
    const tower = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'Tower',
    })
    const park = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'Park',
    })
    const tokyoEntry = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/plan`,
      headers: jsonHeaders(owner.cookie),
      payload: {
        type: 'bucket',
        title: 'Tokyo',
        startDate: '2026-04-12',
        endDate: '2026-04-16',
      },
    })
    const kyotoEntry = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/plan`,
      headers: jsonHeaders(owner.cookie),
      payload: {
        type: 'bucket',
        title: 'Kyoto',
        startDate: '2026-04-17',
        endDate: '2026-04-20',
      },
    })
    expect(tokyoEntry.statusCode).toBe(201)
    expect(kyotoEntry.statusCode).toBe(201)
    const tokyoId = tokyoEntry.json().id as string
    const kyotoId = kyotoEntry.json().id as string
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/plan/${tokyoId}/spots`,
          headers: jsonHeaders(owner.cookie),
          payload: {
            spotId: tower.json().id,
            visitDate: '2026-04-13',
            visitTime: '18:00',
          },
        })
      ).statusCode,
    ).toBe(201)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/plan/${kyotoId}/spots`,
          headers: jsonHeaders(owner.cookie),
          payload: { spotId: park.json().id, visitDate: '2026-04-18' },
        })
      ).statusCode,
    ).toBe(201)

    const onlyTokyo = await list(owner.cookie, tripId, `entry=${tokyoId}`)
    expect(onlyTokyo.statusCode).toBe(200)
    expect(titles(onlyTokyo)).toEqual(['Tower'])
    expect(onlyTokyo.json().total).toBe(2)

    const invalid = await list(owner.cookie, tripId, 'entry=nope')
    expect(invalid.statusCode).toBe(400)
  })

  it('T-09-03 lists the seed in scheduled-first order', async () => {
    await seedDatabase(db.pool)
    const owner = await login('100000000000000001')
    const listed = await list(owner.cookie, seedTrip, 'sort=scheduled')
    expect(listed.statusCode).toBe(200)
    expect(titles(listed)).toEqual([
      'Shibuya Sky',
      'teamLab Borderless',
      'Fushimi Inari',
      'Nara Park',
      'Hotel Gracery',
      'Kyoto Ryokan',
    ])
    expect(listed.json().total).toBe(6)
  })

  it('T-09-04 sorts by each option and rejects an unknown sort', async () => {
    await seedDatabase(db.pool)
    const owner = await login('100000000000000001')
    const stranger = await login('100000000000000694')

    expect(titles(await list(owner.cookie, seedTrip, 'sort=datetime'))).toEqual(
      [
        'Shibuya Sky',
        'teamLab Borderless',
        'Fushimi Inari',
        'Hotel Gracery',
        'Kyoto Ryokan',
        'Nara Park',
      ],
    )
    expect(titles(await list(owner.cookie, seedTrip, 'sort=category'))).toEqual(
      [
        'Nara Park',
        'Fushimi Inari',
        'Shibuya Sky',
        'teamLab Borderless',
        'Hotel Gracery',
        'Kyoto Ryokan',
      ],
    )
    expect(titles(await list(owner.cookie, seedTrip, 'sort=az'))).toEqual([
      'Fushimi Inari',
      'Hotel Gracery',
      'Kyoto Ryokan',
      'Nara Park',
      'Shibuya Sky',
      'teamLab Borderless',
    ])
    expect(titles(await list(owner.cookie, seedTrip, 'sort=newest'))).toEqual([
      'Kyoto Ryokan',
      'Hotel Gracery',
      'Nara Park',
      'Fushimi Inari',
      'teamLab Borderless',
      'Shibuya Sky',
    ])

    const unknown = await list(owner.cookie, seedTrip, 'sort=nope')
    expect(unknown.statusCode).toBe(400)
    expect(unknown.json().fields.sort).toBe('invalid')

    const anon = await app.inject({
      method: 'GET',
      url: `/trips/${seedTrip}/spots?sort=az`,
    })
    expect(anon.statusCode).toBe(401)
    const missing = await list(stranger.cookie, seedTrip, 'sort=az')
    expect(missing.statusCode).toBe(404)
  })

  it('T-12-02 replaces the previous primary home and clears it when recategorised', async () => {
    const owner = await login('100000000000001201')
    const tripId = await createTrip(owner.cookie)
    const spotA = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'A Inn',
      baseCategory: 'home',
      primary: true,
    })
    expect(spotA.statusCode).toBe(201)
    expect(spotA.json().primary).toBe(true)
    const spotB = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'Z Hotel',
      baseCategory: 'home',
      stayFrom: '2026-04-12',
      stayTo: '2026-04-16',
    })
    const promoted = await patchSpot(owner.cookie, spotB.json().id as string, {
      primary: true,
    })
    expect(promoted.statusCode).toBe(200)
    expect(promoted.json().primary).toBe(true)
    const previous = await app.inject({
      method: 'GET',
      url: `/spots/${spotA.json().id}`,
      headers: { cookie: owner.cookie },
    })
    expect(previous.json().primary).toBe(false)

    const listed = await list(owner.cookie, tripId, 'sort=category')
    expect(titles(listed)).toEqual(['Z Hotel', 'A Inn'])

    const recategorised = await patchSpot(
      owner.cookie,
      spotB.json().id as string,
      { baseCategory: 'maybe' },
    )
    expect(recategorised.statusCode).toBe(200)
    expect(recategorised.json()).toMatchObject({
      baseCategory: 'maybe',
      primary: false,
      stayFrom: null,
      stayTo: null,
    })
    const primary = await db.pool.query<{ id: string | null }>(
      'SELECT primary_home_spot_id AS id FROM trips WHERE id = $1',
      [tripId],
    )
    expect(primary.rows[0]?.id).toBeNull()

    const dated = await patchSpot(owner.cookie, spotA.json().id as string, {
      stayFrom: '2026-04-17',
      stayTo: '2026-04-19',
    })
    expect(dated.statusCode).toBe(200)
    const cleared = await patchSpot(owner.cookie, spotA.json().id as string, {
      stayFrom: null,
      stayTo: null,
    })
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json()).toMatchObject({
      baseCategory: 'home',
      stayFrom: null,
      stayTo: null,
    })
  })

  it('T-12-03 rejects stay dates on a non-home spot and a reversed stay', async () => {
    const owner = await login('100000000000001202')
    const tripId = await createTrip(owner.cookie)
    const onMustGo = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      stayFrom: '2026-04-12',
      stayTo: '2026-04-16',
    })
    expect(onMustGo.statusCode).toBe(400)
    expect(onMustGo.json().fields.stayFrom).toBe('home_only')

    const reversed = await postSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'Hotel',
      baseCategory: 'home',
      stayFrom: '2026-04-16',
      stayTo: '2026-04-12',
    })
    expect(reversed.statusCode).toBe(400)
    expect(reversed.json().fields.stayTo).toBe('before_start')
  })

  it('rejects anonymous callers, a foreign origin, and a bad id', async () => {
    const owner = await login('100000000000000671')
    const tripId = await createTrip(owner.cookie)
    const created = await postSpot(owner.cookie, tripId, tokyo)
    const spotId = created.json().id as string

    for (const url of [`/trips/${tripId}/spots`, `/spots/${spotId}`]) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode).toBe(401)
    }
    const posted = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/spots`,
      headers: { 'content-type': 'application/json' },
      payload: tokyo,
    })
    expect(posted.statusCode).toBe(401)

    const foreign = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/spots`,
      headers: {
        cookie: owner.cookie,
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      payload: tokyo,
    })
    expect(foreign.statusCode).toBe(403)
    expect(foreign.json()).toEqual({ error: 'forbidden_origin' })

    const badId = await app.inject({
      method: 'GET',
      url: '/spots/not-a-uuid',
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

  async function createTrip(
    cookie: string,
    payload: object = honshu,
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: jsonHeaders(cookie),
      payload,
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  function list(cookie: string, tripId: string, search: string) {
    return app.inject({
      method: 'GET',
      url: `/trips/${tripId}/spots?${search}`,
      headers: { cookie },
    })
  }

  function postSpot(cookie: string, tripId: string, payload: object) {
    return app.inject({
      method: 'POST',
      url: `/trips/${tripId}/spots`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function patchSpot(cookie: string, spotId: string, payload: object) {
    return app.inject({
      method: 'PATCH',
      url: `/spots/${spotId}`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function deleteSpot(cookie: string, spotId: string) {
    return app.inject({
      method: 'DELETE',
      url: `/spots/${spotId}`,
      headers: writeHeaders(cookie),
    })
  }

  async function scheduleSpot(tripId: string, spotId: string, userId: string) {
    const entry = await db.pool.query<{ id: string }>(
      `
      INSERT INTO plan_entries (trip_id, type, title, start_date, end_date, created_by)
      VALUES ($1, 'bucket', 'Days', '2026-04-12', '2026-04-16', $2)
      RETURNING id
      `,
      [tripId, userId],
    )
    await db.pool.query(
      `
      INSERT INTO plan_entry_spots (
        trip_id, plan_entry_id, spot_id, visit_date, visit_time, sort_order
      )
      VALUES ($1, $2, $3, '2026-04-13', '18:00', 0)
      `,
      [tripId, entry.rows[0]?.id, spotId],
    )
  }

  async function addMember(tripId: string, userId: string, role: string) {
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, $3)`,
      [tripId, userId, role],
    )
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

function titles(response: LightMyRequestResponse): string[] {
  return response.json().spots.map((spot: { title: string }) => spot.title)
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
