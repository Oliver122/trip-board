import { outsideVisitMessage } from '@tripboard/shared'
import type { LightMyRequestResponse } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { seedDatabase, seedIds } from '../db/seed.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'
const missingId = '20000000-0000-0000-0000-000000000099'

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
}

describe('plan', () => {
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

  it('T-10-01 creates a bucket and a single, and rejects a bad range', async () => {
    const owner = await login('100000000000001001')
    const tripId = await createTrip(owner.cookie)

    const noEnd = await postEntry(owner.cookie, tripId, {
      type: 'bucket',
      title: 'Tokyo',
      startDate: '2026-04-12',
    })
    expect(noEnd.statusCode).toBe(400)
    expect(noEnd.json().fields.endDate).toBe('end_date_required')

    const spanning = await postEntry(owner.cookie, tripId, {
      type: 'single',
      title: 'Fuji',
      date: '2026-04-16',
      endDate: '2026-04-17',
      startTime: '04:30',
    })
    expect(spanning.statusCode).toBe(400)
    expect(spanning.json().fields.endDate).toBe('spans_days')

    const earlyEnd = await postEntry(owner.cookie, tripId, {
      type: 'single',
      title: 'Fuji',
      date: '2026-04-16',
      startTime: '05:00',
      endTime: '04:30',
    })
    expect(earlyEnd.statusCode).toBe(400)
    expect(earlyEnd.json().fields.endTime).toBe('end_before_start')

    const bucket = await postEntry(owner.cookie, tripId, {
      type: 'bucket',
      title: 'Tokyo 12–16 Apr',
      startDate: '2026-04-12',
      endDate: '2026-04-16',
    })
    expect(bucket.statusCode).toBe(201)
    expect(bucket.json()).toMatchObject({
      tripId,
      type: 'bucket',
      title: 'Tokyo 12–16 Apr',
      startDate: '2026-04-12',
      endDate: '2026-04-16',
      startTime: null,
      endTime: null,
      info: null,
      outsideTripDates: false,
      spots: [],
    })

    const single = await postEntry(owner.cookie, tripId, {
      type: 'single',
      title: 'Fuji 16 Apr 04:30',
      date: '2026-04-16',
      startTime: '04:30',
      info: 'Sunrise',
    })
    expect(single.statusCode).toBe(201)
    expect(single.json()).toMatchObject({
      type: 'single',
      title: 'Fuji 16 Apr 04:30',
      startDate: '2026-04-16',
      endDate: null,
      startTime: '04:30',
      endTime: null,
      info: 'Sunrise',
      outsideTripDates: false,
      spots: [],
    })

    const events = await db.pool.query<{ action: string; plan: string }>(
      `SELECT action, metadata->>'plan' AS plan
       FROM activity_events WHERE action LIKE 'plan.%' ORDER BY id`,
    )
    expect(events.rows).toEqual([
      { action: 'plan.create', plan: 'Tokyo 12–16 Apr' },
      { action: 'plan.create', plan: 'Fuji 16 Apr 04:30' },
    ])
  })

  it('T-10-02 lists entries by date, then time, then sort order', async () => {
    const owner = await login('100000000000001011')
    const visitor = await login('100000000000001012')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, visitor.user.id, 'visitor')

    await postEntry(owner.cookie, tripId, {
      type: 'single',
      title: 'Kyoto 17 Apr',
      date: '2026-04-17',
    })
    await postEntry(owner.cookie, tripId, {
      type: 'single',
      title: 'Fuji 16 Apr 04:30',
      date: '2026-04-16',
      startTime: '04:30',
    })
    await postEntry(owner.cookie, tripId, {
      type: 'bucket',
      title: 'Tokyo 12–16 Apr',
      startDate: '2026-04-12',
      endDate: '2026-04-16',
    })

    const listed = await getPlan(visitor.cookie, tripId)
    expect(listed.statusCode).toBe(200)
    expect(
      listed.json().entries.map((entry: { title: string }) => entry.title),
    ).toEqual(['Tokyo 12–16 Apr', 'Fuji 16 Apr 04:30', 'Kyoto 17 Apr'])
  })

  it('T-10-03 marks a spot planned and keeps a home spot as home', async () => {
    const owner = await login('100000000000001021')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId, tokyo)
    const homeId = await createSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'Hotel',
      baseCategory: 'home',
    })
    const tokyoId = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'bucket',
        title: 'Tokyo 12–16 Apr',
        startDate: '2026-04-12',
        endDate: '2026-04-16',
      }),
    )
    const fujiId = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'single',
        title: 'Fuji 16 Apr 04:30',
        date: '2026-04-16',
        startTime: '04:30',
      }),
    )

    const added = await postLink(owner.cookie, tokyoId, { spotId })
    expect(added.statusCode).toBe(201)
    const once = await getSpot(owner.cookie, spotId)
    expect(once).toMatchObject({
      displayCategory: 'planned',
      planCount: 1,
      baseCategory: 'must_go',
      firstScheduledAt: '2026-04-12T00:00:00',
    })

    expect((await postLink(owner.cookie, fujiId, { spotId })).statusCode).toBe(
      201,
    )
    const twice = await getSpot(owner.cookie, spotId)
    expect(twice).toMatchObject({
      displayCategory: 'planned',
      planCount: 2,
      firstScheduledAt: '2026-04-12T00:00:00',
    })

    expect(
      (await postLink(owner.cookie, tokyoId, { spotId: homeId })).statusCode,
    ).toBe(201)
    const home = await getSpot(owner.cookie, homeId)
    expect(home).toMatchObject({
      displayCategory: 'home',
      baseCategory: 'home',
      planCount: 1,
      firstScheduledAt: '2026-04-12T00:00:00',
    })

    const events = await db.pool.query<{ action: string }>(
      `SELECT action FROM activity_events WHERE action = 'plan.spot_add'`,
    )
    expect(events.rows).toHaveLength(3)
  })

  it('T-10-04 keeps two links when the same spot is added twice', async () => {
    const owner = await login('100000000000001031')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId, tokyo)
    const tokyoId = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'bucket',
        title: 'Tokyo 12–16 Apr',
        startDate: '2026-04-12',
        endDate: '2026-04-16',
      }),
    )
    const first = await postLink(owner.cookie, tokyoId, {
      spotId,
      visitDate: '2026-04-13',
    })
    const second = await postLink(owner.cookie, tokyoId, {
      spotId,
      visitDate: '2026-04-15',
      visitTime: '19:00',
    })
    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(201)
    expect(first.json().id).not.toBe(second.json().id)

    const listed = await getPlan(owner.cookie, tripId)
    expect(listed.json().entries[0].spots).toMatchObject([
      { id: first.json().id, spotId, visitDate: '2026-04-13', visitTime: null },
      {
        id: second.json().id,
        spotId,
        visitDate: '2026-04-15',
        visitTime: '19:00',
      },
    ])

    const detail = await app.inject({
      method: 'GET',
      url: `/spots/${spotId}`,
      headers: { cookie: owner.cookie },
    })
    expect(detail.json().plans).toEqual([
      {
        linkId: first.json().id,
        entryId: tokyoId,
        title: 'Tokyo 12–16 Apr',
        type: 'bucket',
        visitDate: '2026-04-13',
        visitTime: null,
      },
      {
        linkId: second.json().id,
        entryId: tokyoId,
        title: 'Tokyo 12–16 Apr',
        type: 'bucket',
        visitDate: '2026-04-15',
        visitTime: '19:00',
      },
    ])
  })

  it('T-10-05 restores the base category when the last link is removed', async () => {
    const owner = await login('100000000000001041')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId, tokyo)
    const tokyoId = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'bucket',
        title: 'Tokyo 12–16 Apr',
        startDate: '2026-04-12',
        endDate: '2026-04-16',
      }),
    )
    const fujiId = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'single',
        title: 'Fuji',
        date: '2026-04-16',
      }),
    )
    const first = await postLink(owner.cookie, tokyoId, { spotId })
    const second = await postLink(owner.cookie, fujiId, { spotId })
    expect(
      (await deleteLink(owner.cookie, tokyoId, first.json().id as string))
        .statusCode,
    ).toBe(204)
    expect(await getSpot(owner.cookie, spotId)).toMatchObject({
      displayCategory: 'planned',
      planCount: 1,
    })
    expect(
      (await deleteLink(owner.cookie, fujiId, second.json().id as string))
        .statusCode,
    ).toBe(204)
    expect(await getSpot(owner.cookie, spotId)).toMatchObject({
      displayCategory: 'must_go',
      baseCategory: 'must_go',
      planCount: 0,
      firstScheduledAt: null,
      plans: [],
    })
    const events = await db.pool.query<{ action: string }>(
      `SELECT action FROM activity_events WHERE action = 'plan.spot_remove'`,
    )
    expect(events.rows).toHaveLength(2)
  })

  it('T-10-06 rejects a visit outside the bucket and clears dates when it shrinks', async () => {
    const owner = await login('100000000000001051')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId, tokyo)
    const tokyoId = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'bucket',
        title: 'Tokyo 12–16 Apr',
        startDate: '2026-04-12',
        endDate: '2026-04-16',
      }),
    )
    const outside = await postLink(owner.cookie, tokyoId, {
      spotId,
      visitDate: '2026-04-30',
    })
    expect(outside.statusCode).toBe(400)
    expect(outside.json()).toMatchObject({
      error: 'invalid_request',
      message: outsideVisitMessage,
      fields: { visitDate: 'outside_range' },
    })

    const early = await postLink(owner.cookie, tokyoId, {
      spotId,
      visitDate: '2026-04-13',
    })
    const late = await postLink(owner.cookie, tokyoId, {
      spotId,
      visitDate: '2026-04-15',
      visitTime: '11:00',
    })
    expect(early.statusCode).toBe(201)
    expect(late.statusCode).toBe(201)

    const shrunk = await patchEntry(owner.cookie, tokyoId, {
      endDate: '2026-04-14',
    })
    expect(shrunk.statusCode).toBe(200)
    expect(shrunk.json().clearedVisitDates).toBe(1)
    expect(shrunk.json().endDate).toBe('2026-04-14')
    const spots = shrunk.json().spots as {
      id: string
      visitDate: string | null
      visitTime: string | null
    }[]
    expect(spots).toEqual([
      expect.objectContaining({
        id: early.json().id,
        visitDate: '2026-04-13',
        visitTime: null,
      }),
      expect.objectContaining({
        id: late.json().id,
        visitDate: null,
        visitTime: null,
      }),
    ])

    const events = await db.pool.query<{ action: string; plan: string }>(
      `SELECT action, metadata->>'plan' AS plan
       FROM activity_events WHERE action = 'plan.update'`,
    )
    expect(events.rows).toEqual([
      { action: 'plan.update', plan: 'Tokyo 12–16 Apr' },
    ])
  })

  it('T-10-07 leaves spots in place when an entry is deleted', async () => {
    const owner = await login('100000000000001061')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId, tokyo)
    const tokyoId = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'bucket',
        title: 'Tokyo 12–16 Apr',
        startDate: '2026-04-12',
        endDate: '2026-04-16',
      }),
    )
    const fujiId = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'single',
        title: 'Fuji',
        date: '2026-04-16',
      }),
    )
    await postLink(owner.cookie, tokyoId, { spotId })
    await postLink(owner.cookie, fujiId, { spotId })

    const removed = await deleteEntry(owner.cookie, fujiId)
    expect(removed.statusCode).toBe(204)
    expect(await getSpot(owner.cookie, spotId)).toMatchObject({
      displayCategory: 'planned',
      planCount: 1,
    })
    const spots = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM spots WHERE id = $1',
      [spotId],
    )
    expect(spots.rows[0]?.n).toBe(1)

    expect((await deleteEntry(owner.cookie, tokyoId)).statusCode).toBe(204)
    expect(await getSpot(owner.cookie, spotId)).toMatchObject({
      displayCategory: 'must_go',
      planCount: 0,
      plans: [],
    })
    const links = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM plan_entry_spots WHERE spot_id = $1',
      [spotId],
    )
    expect(links.rows[0]?.n).toBe(0)
    const events = await db.pool.query<{ action: string }>(
      `SELECT action FROM activity_events WHERE action = 'plan.delete' ORDER BY id`,
    )
    expect(events.rows).toEqual([
      { action: 'plan.delete' },
      { action: 'plan.delete' },
    ])
  })

  it('T-10-08 rejects a foreign link and keeps a valid reorder', async () => {
    const owner = await login('100000000000001071')
    const tripId = await createTrip(owner.cookie)
    const firstSpot = await createSpot(owner.cookie, tripId, tokyo)
    const secondSpot = await createSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'TeamLab',
    })
    const tokyoId = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'bucket',
        title: 'Tokyo',
        startDate: '2026-04-12',
        endDate: '2026-04-16',
      }),
    )
    const fujiId = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'single',
        title: 'Fuji',
        date: '2026-04-16',
      }),
    )
    const first = await postLink(owner.cookie, tokyoId, { spotId: firstSpot })
    const second = await postLink(owner.cookie, tokyoId, { spotId: secondSpot })
    const foreign = await postLink(owner.cookie, fujiId, { spotId: firstSpot })

    const rejected = await reorder(owner.cookie, tokyoId, [
      foreign.json().id as string,
      first.json().id as string,
    ])
    expect(rejected.statusCode).toBe(400)
    expect(rejected.json().fields.linkIds).toBe('other_entry')

    const kept = await getPlan(owner.cookie, tripId)
    const tokyoEntry = kept
      .json()
      .entries.find((entry: { id: string }) => entry.id === tokyoId)
    expect(tokyoEntry.spots.map((link: { id: string }) => link.id)).toEqual([
      first.json().id,
      second.json().id,
    ])

    const swapped = await reorder(owner.cookie, tokyoId, [
      second.json().id as string,
      first.json().id as string,
    ])
    expect(swapped.statusCode).toBe(200)
    expect(
      swapped.json().spots.map((link: { spotId: string }) => link.spotId),
    ).toEqual([secondSpot, firstSpot])
    const again = await getPlan(owner.cookie, tripId)
    const after = again
      .json()
      .entries.find((entry: { id: string }) => entry.id === tokyoId)
    expect(after.spots.map((link: { spotId: string }) => link.spotId)).toEqual([
      secondSpot,
      firstSpot,
    ])
  })

  it('T-10-09 enforces the role matrix and hides other trips', async () => {
    const owner = await login('100000000000001081')
    const planner = await login('100000000000001082')
    const visitor = await login('100000000000001083')
    const stranger = await login('100000000000001084')
    const tripId = await createTrip(owner.cookie)
    const otherTrip = await createTrip(owner.cookie, {
      ...honshu,
      name: 'Kyushu',
    })
    await addMember(tripId, planner.user.id, 'planner')
    await addMember(tripId, visitor.user.id, 'visitor')
    const spotId = await createSpot(owner.cookie, tripId, tokyo)
    const otherSpot = await createSpot(owner.cookie, otherTrip, {
      ...tokyo,
      title: 'Other',
    })
    const tokyoId = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'bucket',
        title: 'Tokyo',
        startDate: '2026-04-12',
        endDate: '2026-04-16',
      }),
    )
    const link = await postLink(owner.cookie, tokyoId, { spotId })
    const linkId = link.json().id as string

    const planned = await postEntry(planner.cookie, tripId, {
      type: 'single',
      title: 'Planner day',
      date: '2026-04-18',
    })
    expect(planned.statusCode).toBe(201)

    const writes = [
      () =>
        postEntry(visitor.cookie, tripId, {
          type: 'single',
          title: 'Nope',
          date: '2026-04-19',
        }),
      () => patchEntry(visitor.cookie, tokyoId, { title: 'Nope' }),
      () => deleteEntry(visitor.cookie, tokyoId),
      () => postLink(visitor.cookie, tokyoId, { spotId }),
      () => patchLink(visitor.cookie, tokyoId, linkId, { info: 'Nope' }),
      () => deleteLink(visitor.cookie, tokyoId, linkId),
      () => reorder(visitor.cookie, tokyoId, [linkId]),
    ]
    for (const write of writes) {
      expect((await write()).statusCode).toBe(403)
    }

    const hidden = [
      () => getPlan(stranger.cookie, tripId),
      () =>
        postEntry(stranger.cookie, tripId, {
          type: 'single',
          title: 'Nope',
          date: '2026-04-19',
        }),
      () => patchEntry(stranger.cookie, tokyoId, { title: 'Nope' }),
      () => deleteEntry(stranger.cookie, tokyoId),
      () => postLink(stranger.cookie, tokyoId, { spotId }),
      () => patchLink(stranger.cookie, tokyoId, linkId, { info: 'Nope' }),
      () => deleteLink(stranger.cookie, tokyoId, linkId),
      () => reorder(stranger.cookie, tokyoId, [linkId]),
    ]
    for (const write of hidden) {
      expect((await write()).statusCode).toBe(404)
    }

    const cross = await postLink(owner.cookie, tokyoId, { spotId: otherSpot })
    expect(cross.statusCode).toBe(404)
    expect((await getPlan(visitor.cookie, tripId)).statusCode).toBe(200)
    expect(
      (await patchEntry(owner.cookie, missingId, { title: 'Nope' })).statusCode,
    ).toBe(404)
  })

  it('T-10-10 flags an entry that starts before the trip', async () => {
    const owner = await login('100000000000001091')
    const tripId = await createTrip(owner.cookie, {
      ...honshu,
      startDate: '2026-04-10',
      endDate: '2026-04-20',
    })
    const before = await postEntry(owner.cookie, tripId, {
      type: 'single',
      title: 'Early',
      date: '2026-04-01',
    })
    expect(before.statusCode).toBe(201)
    expect(before.json().outsideTripDates).toBe(true)

    const inside = await postEntry(owner.cookie, tripId, {
      type: 'bucket',
      title: 'Tokyo',
      startDate: '2026-04-12',
      endDate: '2026-04-16',
    })
    expect(inside.statusCode).toBe(201)
    expect(inside.json().outsideTripDates).toBe(false)

    const after = await postEntry(owner.cookie, tripId, {
      type: 'single',
      title: 'Late',
      date: '2026-04-21',
    })
    expect(after.json().outsideTripDates).toBe(true)
  })

  it('T-12-01 resolves each entry to the overlapping stay, else the primary home', async () => {
    await seedDatabase(db.pool)
    const owner = await login('100000000000000001')
    const nara = await postEntry(owner.cookie, seedIds.trip, {
      type: 'single',
      title: 'Nara',
      date: '2026-04-20',
    })
    expect(nara.statusCode).toBe(201)

    const listed = await getPlan(owner.cookie, seedIds.trip)
    expect(listed.statusCode).toBe(200)
    const homes = Object.fromEntries(
      listed
        .json()
        .entries.map((entry: { title: string; home: unknown }) => [
          entry.title,
          entry.home,
        ]),
    )
    expect(homes.Tokyo).toEqual({
      spotId: seedIds.spots.hotel,
      title: 'Hotel Gracery',
    })
    expect(homes.Kyoto).toEqual({
      spotId: seedIds.spots.ryokan,
      title: 'Kyoto Ryokan',
    })
    expect(homes.Nara).toEqual({
      spotId: seedIds.spots.hotel,
      title: 'Hotel Gracery',
    })
  })

  it('T-12-04 keeps a home spot as home after it is added to a plan', async () => {
    const owner = await login('100000000000001221')
    const tripId = await createTrip(owner.cookie)
    const homeId = await createSpot(owner.cookie, tripId, {
      ...tokyo,
      title: 'Hotel Gracery',
      baseCategory: 'home',
    })
    const entry = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'bucket',
        title: 'Tokyo',
        startDate: '2026-04-12',
        endDate: '2026-04-16',
      }),
    )
    expect(
      (await postLink(owner.cookie, entry, { spotId: homeId })).statusCode,
    ).toBe(201)
    const home = await getSpot(owner.cookie, homeId)
    expect(home).toMatchObject({
      displayCategory: 'home',
      baseCategory: 'home',
    })
  })

  it('rejects anonymous callers, a foreign origin, and a bad id', async () => {
    const owner = await login('100000000000001101')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId, tokyo)
    const entry = await entryId(
      postEntry(owner.cookie, tripId, {
        type: 'bucket',
        title: 'Tokyo',
        startDate: '2026-04-12',
        endDate: '2026-04-16',
      }),
    )
    const link = await postLink(owner.cookie, entry, { spotId })
    const linkId = link.json().id as string

    const urls: [string, string][] = [
      ['GET', `/trips/${tripId}/plan`],
      ['POST', `/trips/${tripId}/plan`],
      ['PATCH', `/plan/${entry}`],
      ['DELETE', `/plan/${entry}`],
      ['POST', `/plan/${entry}/spots`],
      ['PATCH', `/plan/${entry}/spots/${linkId}`],
      ['DELETE', `/plan/${entry}/spots/${linkId}`],
      ['PUT', `/plan/${entry}/spots/order`],
    ]
    for (const [method, url] of urls) {
      const response = await app.inject({
        method: method as 'GET',
        url,
        headers:
          method === 'GET' || method === 'DELETE'
            ? undefined
            : { 'content-type': 'application/json' },
        payload: method === 'GET' || method === 'DELETE' ? undefined : {},
      })
      expect(response.statusCode).toBe(401)
    }

    const foreign = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/plan`,
      headers: {
        cookie: owner.cookie,
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      payload: {
        type: 'single',
        title: 'Nope',
        date: '2026-04-16',
      },
    })
    expect(foreign.statusCode).toBe(403)
    expect(foreign.json()).toEqual({ error: 'forbidden_origin' })

    const badTrip = await app.inject({
      method: 'GET',
      url: '/trips/not-a-uuid/plan',
      headers: { cookie: owner.cookie },
    })
    expect(badTrip.statusCode).toBe(400)
    expect(badTrip.json().fields.id).toBe('invalid')

    const badLink = await app.inject({
      method: 'PATCH',
      url: `/plan/${entry}/spots/not-a-uuid`,
      headers: jsonHeaders(owner.cookie),
      payload: { info: 'Nope' },
    })
    expect(badLink.statusCode).toBe(400)
    expect(badLink.json().fields.linkId).toBe('invalid')

    const empty = await postEntry(owner.cookie, tripId, {})
    expect(empty.statusCode).toBe(400)
    const emptyPatch = await patchEntry(owner.cookie, entry, {})
    expect(emptyPatch.statusCode).toBe(400)
    expect(emptyPatch.json().fields.body).toBe('empty')
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

  async function createSpot(
    cookie: string,
    tripId: string,
    payload: object,
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/spots`,
      headers: jsonHeaders(cookie),
      payload,
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  function getPlan(cookie: string, tripId: string) {
    return app.inject({
      method: 'GET',
      url: `/trips/${tripId}/plan`,
      headers: { cookie },
    })
  }

  function postEntry(cookie: string, tripId: string, payload: object) {
    return app.inject({
      method: 'POST',
      url: `/trips/${tripId}/plan`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function patchEntry(cookie: string, entryId: string, payload: object) {
    return app.inject({
      method: 'PATCH',
      url: `/plan/${entryId}`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function deleteEntry(cookie: string, entryId: string) {
    return app.inject({
      method: 'DELETE',
      url: `/plan/${entryId}`,
      headers: writeHeaders(cookie),
    })
  }

  function postLink(cookie: string, entryId: string, payload: object) {
    return app.inject({
      method: 'POST',
      url: `/plan/${entryId}/spots`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function patchLink(
    cookie: string,
    entryId: string,
    linkId: string,
    payload: object,
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/plan/${entryId}/spots/${linkId}`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function deleteLink(cookie: string, entryId: string, linkId: string) {
    return app.inject({
      method: 'DELETE',
      url: `/plan/${entryId}/spots/${linkId}`,
      headers: writeHeaders(cookie),
    })
  }

  function reorder(cookie: string, entryId: string, linkIds: string[]) {
    return app.inject({
      method: 'PUT',
      url: `/plan/${entryId}/spots/order`,
      headers: jsonHeaders(cookie),
      payload: { linkIds },
    })
  }

  async function getSpot(cookie: string, spotId: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/spots/${spotId}`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    return response.json()
  }

  async function entryId(response: Promise<LightMyRequestResponse>) {
    const resolved = await response
    expect(resolved.statusCode).toBe(201)
    return resolved.json().id as string
  }

  async function addMember(tripId: string, userId: string, role: string) {
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, $3)`,
      [tripId, userId, role],
    )
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
