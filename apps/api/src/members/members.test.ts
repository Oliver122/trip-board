import type { LightMyRequestResponse } from 'fastify'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import type { ObjectStorage } from '../images/storage.js'
import { inviteTtlMs } from './code.js'
import { JoinLimiter } from './limit.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'

const japan = {
  name: 'Japan 2026',
  timezone: 'Asia/Tokyo',
  region: {
    bbox: { minLng: 122.94, minLat: 24.4, maxLng: 145.82, maxLat: 45.55 },
  },
}

const crockfordSuffix = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/

describe('members', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig
  let limiter: JoinLimiter
  let png: Buffer
  let now = new Date('2026-06-01T00:00:00.000Z')
  let serial = 1300

  beforeAll(async () => {
    db = await createTestDatabase()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
    })
    limiter = new JoinLimiter()
    png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 20, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer()
    app = await buildApp(db.pool, {
      config,
      now: () => now,
      storage: memoryStorage(),
      joinLimiter: limiter,
    })
  })

  afterAll(async () => {
    await app.close()
    await db.drop()
  })

  beforeEach(async () => {
    now = new Date('2026-06-01T00:00:00.000Z')
    limiter.clear()
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

  it('T-13-01 creates a visitor invite that expires in 7 days', async () => {
    const owner = await login('100000000000001301')
    const planner = await login('100000000000001302')
    const visitor = await login('100000000000001303')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, planner.user.id, 'planner')
    await addMember(tripId, visitor.user.id, 'visitor')

    const created = await postInvite(owner.cookie, tripId, {})
    expect(created.statusCode).toBe(201)
    const invite = created.json()
    expect(invite.role).toBe('visitor')
    expect(invite.uses).toBe(0)
    expect(invite.code).toMatch(/^JAP-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/)
    expect(crockfordSuffix.test(invite.code.slice(4))).toBe(true)
    expect(new Date(invite.expiresAt).getTime()).toBe(
      now.getTime() + inviteTtlMs,
    )

    expect((await postInvite(planner.cookie, tripId, {})).statusCode).toBe(403)
    expect((await postInvite(visitor.cookie, tripId, {})).statusCode).toBe(403)

    const listed = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}/invites`,
      headers: { cookie: owner.cookie },
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().invites).toEqual([
      expect.objectContaining({ id: invite.id, code: invite.code, uses: 0 }),
    ])
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/trips/${tripId}/invites`,
          headers: { cookie: planner.cookie },
        })
      ).statusCode,
    ).toBe(403)

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/invites/${invite.id}`,
      headers: writeHeaders(owner.cookie),
    })
    expect(revoked.statusCode).toBe(204)
    const after = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}/invites`,
      headers: { cookie: owner.cookie },
    })
    expect(after.json().invites).toEqual([])

    const events = await db.pool.query<{ action: string }>(
      `SELECT action FROM activity_events WHERE action LIKE 'invite.%' ORDER BY id`,
    )
    expect(events.rows.map((row) => row.action)).toEqual([
      'invite.create',
      'invite.revoke',
    ])
  })

  it('T-13-02 rejects an owner role on an invite', async () => {
    const owner = await login('100000000000001304')
    const tripId = await createTrip(owner.cookie)
    const response = await postInvite(owner.cookie, tripId, { role: 'owner' })
    expect(response.statusCode).toBe(400)
    expect(response.json().fields.role).toBe('invalid')
  })

  it('T-13-03 joins a new user with the invite role and counts the use', async () => {
    const owner = await login('100000000000001305')
    const guest = await login('100000000000001306')
    const tripId = await createTrip(owner.cookie)
    const invite = (
      await postInvite(owner.cookie, tripId, { role: 'planner' })
    ).json()

    const preview = await app.inject({
      method: 'GET',
      url: `/join/${invite.code}`,
    })
    expect(preview.statusCode).toBe(200)
    expect(preview.json()).toMatchObject({
      tripId,
      tripName: 'Japan 2026',
      ownerName: owner.user.username,
      memberCount: 1,
      role: 'planner',
    })

    const joined = await app.inject({
      method: 'POST',
      url: `/join/${invite.code}`,
      headers: writeHeaders(guest.cookie),
    })
    expect(joined.statusCode).toBe(200)
    expect(joined.json()).toEqual({ tripId })

    const member = await db.pool.query<{
      role: string
      invited_via: string
    }>(
      `SELECT role, invited_via FROM trip_members WHERE trip_id = $1 AND user_id = $2`,
      [tripId, guest.user.id],
    )
    expect(member.rows).toEqual([{ role: 'planner', invited_via: invite.id }])
    const uses = await db.pool.query<{ uses: number }>(
      `SELECT uses FROM trip_invites WHERE id = $1`,
      [invite.id],
    )
    expect(uses.rows[0]?.uses).toBe(1)
    const events = await db.pool.query<{ action: string }>(
      `SELECT action FROM activity_events WHERE action = 'member.join'`,
    )
    expect(events.rows).toEqual([{ action: 'member.join' }])
  })

  it('T-13-04 rejects expired and revoked codes', async () => {
    const owner = await login('100000000000001307')
    const guest = await login('100000000000001308')
    const tripId = await createTrip(owner.cookie)
    const invite = (await postInvite(owner.cookie, tripId, {})).json()

    now = new Date(now.getTime() + inviteTtlMs + 60_000)
    const expiredGet = await app.inject({
      method: 'GET',
      url: `/join/${invite.code}`,
    })
    const expiredPost = await app.inject({
      method: 'POST',
      url: `/join/${invite.code}`,
      headers: writeHeaders(guest.cookie),
    })
    expect(expiredGet.statusCode).toBe(410)
    expect(expiredGet.json().error).toBe('expired')
    expect(expiredPost.statusCode).toBe(410)
    expect(expiredPost.json().error).toBe('expired')

    const fresh = (await postInvite(owner.cookie, tripId, {})).json()
    const revoked = await app.inject({
      method: 'DELETE',
      url: `/invites/${fresh.id}`,
      headers: writeHeaders(owner.cookie),
    })
    expect(revoked.statusCode).toBe(204)
    const revokedGet = await app.inject({
      method: 'GET',
      url: `/join/${fresh.code}`,
    })
    const revokedPost = await app.inject({
      method: 'POST',
      url: `/join/${fresh.code}`,
      headers: writeHeaders(guest.cookie),
    })
    expect(revokedGet.statusCode).toBe(410)
    expect(revokedGet.json().error).toBe('revoked')
    expect(revokedPost.statusCode).toBe(410)
    expect(revokedPost.json().error).toBe('revoked')
  })

  it('T-13-05 keeps an existing member role when they use a weaker invite', async () => {
    const owner = await login('100000000000001309')
    const planner = await login('100000000000001310')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, planner.user.id, 'planner')
    const invite = (
      await postInvite(owner.cookie, tripId, { role: 'visitor' })
    ).json()

    const joined = await app.inject({
      method: 'POST',
      url: `/join/${invite.code}`,
      headers: writeHeaders(planner.cookie),
    })
    expect(joined.statusCode).toBe(200)
    expect(joined.json().tripId).toBe(tripId)
    const role = await db.pool.query<{ role: string }>(
      `SELECT role FROM trip_members WHERE trip_id = $1 AND user_id = $2`,
      [tripId, planner.user.id],
    )
    expect(role.rows).toEqual([{ role: 'planner' }])
  })

  it("T-13-06 a role change to visitor blocks the member's next spot edit", async () => {
    const owner = await login('100000000000001311')
    const aiko = await login('100000000000001312')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, aiko.user.id, 'planner')
    const spotId = await insertSpot(tripId, owner.user.id)

    const changed = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}/members/${aiko.user.id}`,
      headers: jsonHeaders(owner.cookie),
      payload: { role: 'visitor' },
    })
    expect(changed.statusCode).toBe(200)
    expect(changed.json().role).toBe('visitor')

    const patched = await app.inject({
      method: 'PATCH',
      url: `/spots/${spotId}`,
      headers: jsonHeaders(aiko.cookie),
      payload: { title: 'Changed' },
    })
    expect(patched.statusCode).toBe(403)

    const removed = await app.inject({
      method: 'DELETE',
      url: `/trips/${tripId}/members/${aiko.user.id}`,
      headers: writeHeaders(owner.cookie),
    })
    expect(removed.statusCode).toBe(204)
    const events = await db.pool.query<{ action: string }>(
      `
      SELECT action FROM activity_events
      WHERE action IN ('member.role_update', 'member.remove')
      ORDER BY id
      `,
    )
    expect(events.rows.map((row) => row.action)).toEqual([
      'member.role_update',
      'member.remove',
    ])
  })

  it('T-13-07 transfers ownership in one transaction', async () => {
    const sven = await login('100000000000001313')
    const aiko = await login('100000000000001314')
    const stranger = await login('100000000000001315')
    const tripId = await createTrip(sven.cookie)
    await addMember(tripId, aiko.user.id, 'planner')

    const missing = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/transfer`,
      headers: jsonHeaders(sven.cookie),
      payload: { userId: stranger.user.id },
    })
    expect(missing.statusCode).toBe(400)

    const transferred = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/transfer`,
      headers: jsonHeaders(sven.cookie),
      payload: { userId: aiko.user.id },
    })
    expect(transferred.statusCode).toBe(200)
    const rows = await db.pool.query<{ user_id: string; role: string }>(
      `SELECT user_id, role FROM trip_members WHERE trip_id = $1 ORDER BY role`,
      [tripId],
    )
    expect(rows.rows).toEqual([
      { user_id: aiko.user.id, role: 'owner' },
      { user_id: sven.user.id, role: 'planner' },
    ])
    expect(rows.rows.filter((row) => row.role === 'owner')).toHaveLength(1)
    const creator = await db.pool.query<{ created_by: string }>(
      `SELECT created_by FROM trips WHERE id = $1`,
      [tripId],
    )
    expect(creator.rows[0]?.created_by).toBe(sven.user.id)
    const events = await db.pool.query<{ action: string }>(
      `SELECT action FROM activity_events WHERE action = 'trip.transfer'`,
    )
    expect(events.rows).toEqual([{ action: 'trip.transfer' }])
  })

  it('T-13-08 makes the owner transfer before leaving', async () => {
    const owner = await login('100000000000001316')
    const visitor = await login('100000000000001317')
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, visitor.user.id, 'visitor')

    const blocked = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/leave`,
      headers: writeHeaders(owner.cookie),
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().message).toBe('transfer ownership first')

    const left = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/leave`,
      headers: writeHeaders(visitor.cookie),
    })
    expect(left.statusCode).toBe(204)
    const list = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { cookie: visitor.cookie },
    })
    expect(list.json().trips).toEqual([])
    const events = await db.pool.query<{ action: string }>(
      `SELECT action FROM activity_events WHERE action = 'member.leave'`,
    )
    expect(events.rows).toEqual([{ action: 'member.leave' }])
  })

  it('T-13-09 rate-limits the 11th join attempt from one IP', async () => {
    const guest = await login('100000000000001318')
    let last = 0
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/join/AAA-2345',
        headers: writeHeaders(guest.cookie),
        remoteAddress: '203.0.113.9',
      })
      last = response.statusCode
    }
    expect(last).toBe(429)
  })

  it('T-13-10 enforces the permission matrix on every write', async () => {
    const cases: Array<{
      name: string
      expected: Record<Actor, number>
      run: (world: World, actor: Actor) => Promise<LightMyRequestResponse>
    }> = [
      {
        name: 'PATCH /trips/:id',
        expected: { owner: 200, planner: 200, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'PATCH',
            url: `/trips/${world.tripId}`,
            headers: jsonHeaders(world.cookies[actor]),
            payload: { name: `Renamed ${actor}` },
          }),
      },
      {
        name: 'DELETE /trips/:id',
        expected: { owner: 204, planner: 403, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'DELETE',
            url: `/trips/${world.tripId}`,
            headers: writeHeaders(world.cookies[actor]),
          }),
      },
      {
        name: 'POST /trips/:id/spots',
        expected: { owner: 201, planner: 201, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'POST',
            url: `/trips/${world.tripId}/spots`,
            headers: jsonHeaders(world.cookies[actor]),
            payload: {
              title: 'New spot',
              lat: 35.6,
              lng: 139.7,
              baseCategory: 'maybe',
            },
          }),
      },
      {
        name: 'PATCH /spots/:id',
        expected: { owner: 200, planner: 200, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'PATCH',
            url: `/spots/${world.spotId}`,
            headers: jsonHeaders(world.cookies[actor]),
            payload: { title: `Edited ${actor}` },
          }),
      },
      {
        name: 'DELETE /spots/:id',
        expected: { owner: 204, planner: 204, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'DELETE',
            url: `/spots/${world.spotId}`,
            headers: writeHeaders(world.cookies[actor]),
          }),
      },
      {
        name: 'POST /trips/:id/plan',
        expected: { owner: 201, planner: 201, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'POST',
            url: `/trips/${world.tripId}/plan`,
            headers: jsonHeaders(world.cookies[actor]),
            payload: {
              type: 'bucket',
              title: 'Osaka',
              startDate: '2026-05-01',
              endDate: '2026-05-03',
            },
          }),
      },
      {
        name: 'PATCH /plan/:id',
        expected: { owner: 200, planner: 200, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'PATCH',
            url: `/plan/${world.entryId}`,
            headers: jsonHeaders(world.cookies[actor]),
            payload: { title: `Edited ${actor}` },
          }),
      },
      {
        name: 'DELETE /plan/:id',
        expected: { owner: 204, planner: 204, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'DELETE',
            url: `/plan/${world.entryId}`,
            headers: writeHeaders(world.cookies[actor]),
          }),
      },
      {
        name: 'POST /plan/:id/spots',
        expected: { owner: 201, planner: 201, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'POST',
            url: `/plan/${world.entryId}/spots`,
            headers: jsonHeaders(world.cookies[actor]),
            payload: { spotId: world.spotId },
          }),
      },
      {
        name: 'PATCH /plan/:id/spots/:linkId',
        expected: { owner: 200, planner: 200, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'PATCH',
            url: `/plan/${world.entryId}/spots/${world.linkId}`,
            headers: jsonHeaders(world.cookies[actor]),
            payload: { info: 'note' },
          }),
      },
      {
        name: 'DELETE /plan/:id/spots/:linkId',
        expected: { owner: 204, planner: 204, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'DELETE',
            url: `/plan/${world.entryId}/spots/${world.linkId}`,
            headers: writeHeaders(world.cookies[actor]),
          }),
      },
      {
        name: 'PUT /plan/:id/spots/order',
        expected: { owner: 200, planner: 200, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'PUT',
            url: `/plan/${world.entryId}/spots/order`,
            headers: jsonHeaders(world.cookies[actor]),
            payload: { linkIds: [world.linkId] },
          }),
      },
      {
        name: 'POST /spots/:id/images',
        expected: { owner: 201, planner: 201, visitor: 403, outsider: 404 },
        run: (world, actor) => {
          const body = multipart(png, 'a.png')
          return app.inject({
            method: 'POST',
            url: `/spots/${world.spotId}/images`,
            headers: { ...writeHeaders(world.cookies[actor]), ...body.headers },
            payload: body.payload,
          })
        },
      },
      {
        name: 'DELETE /images/:id',
        expected: { owner: 204, planner: 204, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'DELETE',
            url: `/images/${world.imageId}`,
            headers: writeHeaders(world.cookies[actor]),
          }),
      },
      {
        name: 'POST /trips/:id/invites',
        expected: { owner: 201, planner: 403, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'POST',
            url: `/trips/${world.tripId}/invites`,
            headers: jsonHeaders(world.cookies[actor]),
            payload: {},
          }),
      },
      {
        name: 'DELETE /invites/:id',
        expected: { owner: 204, planner: 403, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'DELETE',
            url: `/invites/${world.inviteId}`,
            headers: writeHeaders(world.cookies[actor]),
          }),
      },
      {
        name: 'PATCH /trips/:id/members/:userId',
        expected: { owner: 200, planner: 403, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'PATCH',
            url: `/trips/${world.tripId}/members/${world.ids.planner}`,
            headers: jsonHeaders(world.cookies[actor]),
            payload: { role: 'visitor' },
          }),
      },
      {
        name: 'DELETE /trips/:id/members/:userId',
        expected: { owner: 204, planner: 403, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'DELETE',
            url: `/trips/${world.tripId}/members/${world.ids.visitor}`,
            headers: writeHeaders(world.cookies[actor]),
          }),
      },
      {
        name: 'POST /trips/:id/leave',
        expected: { owner: 409, planner: 204, visitor: 204, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'POST',
            url: `/trips/${world.tripId}/leave`,
            headers: writeHeaders(world.cookies[actor]),
          }),
      },
      {
        name: 'POST /trips/:id/transfer',
        expected: { owner: 200, planner: 403, visitor: 403, outsider: 404 },
        run: (world, actor) =>
          app.inject({
            method: 'POST',
            url: `/trips/${world.tripId}/transfer`,
            headers: jsonHeaders(world.cookies[actor]),
            payload: { userId: world.ids.planner },
          }),
      },
    ]

    for (const entry of cases) {
      for (const actor of actors) {
        const world = await seedWorld()
        const response = await entry.run(world, actor)
        expect(response.statusCode, `${entry.name} as ${actor}`).toBe(
          entry.expected[actor],
        )
      }
    }
  }, 180_000)

  it('T-13-13 serves Open Graph HTML to link-preview bots', async () => {
    const owner = await login('100000000000001390')
    const tripId = await createTrip(owner.cookie)
    await db.pool.query(
      `
      INSERT INTO trip_invites (trip_id, code, role, created_by, created_at, expires_at)
      VALUES ($1, 'JPN-7K3Q', 'visitor', $2, $3, $3::timestamptz + interval '7 days')
      `,
      [tripId, owner.user.id, now],
    )
    await db.pool.query(
      `
      INSERT INTO trip_invites (trip_id, code, role, created_by, created_at, expires_at)
      VALUES ($1, 'OLD-9K3Q', 'visitor', $2, $3, $4)
      `,
      [
        tripId,
        owner.user.id,
        new Date('2026-05-01T00:00:00.000Z'),
        new Date('2026-05-08T00:00:00.000Z'),
      ],
    )

    const live = await app.inject({
      method: 'GET',
      url: '/join/JPN-7K3Q',
      headers: { 'user-agent': 'Discordbot/2.0' },
    })
    expect(live.statusCode).toBe(200)
    expect(String(live.headers['content-type'])).toContain('text/html')
    expect(live.body).toContain('property="og:title"')
    expect(live.body).toContain('Japan 2026')
    expect(live.body).toContain('Join on Trip Board')

    const expired = await app.inject({
      method: 'GET',
      url: '/join/OLD-9K3Q',
      headers: { 'user-agent': 'Discordbot/2.0' },
    })
    expect(String(expired.headers['content-type'])).toContain('text/html')
    expect(expired.body).not.toContain('Japan 2026')

    const browser = await app.inject({
      method: 'GET',
      url: '/join/JPN-7K3Q',
      headers: { 'user-agent': 'Mozilla/5.0' },
    })
    expect(String(browser.headers['content-type'])).toContain(
      'application/json',
    )
    expect(browser.json().tripName).toBe('Japan 2026')
  })

  it('rejects anonymous callers, bad ids, and unknown codes', async () => {
    const owner = await login('100000000000001391')
    const tripId = await createTrip(owner.cookie)
    const listed = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}/members`,
      headers: { cookie: owner.cookie },
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().members).toEqual([
      expect.objectContaining({ userId: owner.user.id, role: 'owner' }),
    ])

    const urls = [
      ['GET', `/trips/${tripId}/members`],
      ['GET', `/trips/${tripId}/invites`],
      ['POST', `/trips/${tripId}/invites`],
      ['PATCH', `/trips/${tripId}/members/${owner.user.id}`],
      ['DELETE', `/trips/${tripId}/members/${owner.user.id}`],
      ['DELETE', `/invites/${owner.user.id}`],
      ['POST', `/trips/${tripId}/leave`],
      ['POST', `/trips/${tripId}/transfer`],
      ['POST', '/join/JPN-7K3Q'],
    ] as const
    for (const [method, url] of urls) {
      const response = await app.inject({ method, url })
      expect(response.statusCode, `${method} ${url}`).toBe(401)
    }

    const badMember = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}/members/not-a-uuid`,
      headers: jsonHeaders(owner.cookie),
      payload: { role: 'visitor' },
    })
    expect(badMember.statusCode).toBe(400)

    const badCode = await app.inject({ method: 'GET', url: '/join/nope' })
    expect(badCode.statusCode).toBe(400)
    const unknown = await app.inject({ method: 'GET', url: '/join/ZZZ-9999' })
    expect(unknown.statusCode).toBe(404)
    expect(unknown.json().error).toBe('not_found')

    const stranger = await login('100000000000001392')
    const hidden = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}/members`,
      headers: { cookie: stranger.cookie },
    })
    expect(hidden.statusCode).toBe(404)
    const missingInvite = await app.inject({
      method: 'DELETE',
      url: '/invites/00000000-0000-0000-0000-000000000099',
      headers: writeHeaders(owner.cookie),
    })
    expect(missingInvite.statusCode).toBe(404)
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

  async function createTrip(cookie: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: jsonHeaders(cookie),
      payload: japan,
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  function postInvite(cookie: string, tripId: string, payload: object) {
    return app.inject({
      method: 'POST',
      url: `/trips/${tripId}/invites`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  async function addMember(tripId: string, userId: string, role: string) {
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, $3)`,
      [tripId, userId, role],
    )
  }

  async function insertSpot(tripId: string, userId: string) {
    const result = await db.pool.query<{ id: string }>(
      `
      INSERT INTO spots (trip_id, title, lat, lng, base_category, created_by)
      VALUES ($1, 'Dot', 35.6, 139.7, 'maybe', $2)
      RETURNING id
      `,
      [tripId, userId],
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('spot missing')
    return id
  }

  async function seedWorld(): Promise<World> {
    const owner = await login(nextDiscordId())
    const planner = await login(nextDiscordId())
    const visitor = await login(nextDiscordId())
    const outsider = await login(nextDiscordId())
    const tripId = await createTrip(owner.cookie)
    await addMember(tripId, planner.user.id, 'planner')
    await addMember(tripId, visitor.user.id, 'visitor')
    const spotId = await insertSpot(tripId, owner.user.id)
    const entry = await db.pool.query<{ id: string }>(
      `
      INSERT INTO plan_entries (trip_id, type, title, start_date, end_date, created_by)
      VALUES ($1, 'bucket', 'Tokyo', '2026-04-12', '2026-04-16', $2)
      RETURNING id
      `,
      [tripId, owner.user.id],
    )
    const entryId = entry.rows[0]?.id
    if (!entryId) throw new Error('entry missing')
    const link = await db.pool.query<{ id: string }>(
      `
      INSERT INTO plan_entry_spots (trip_id, plan_entry_id, spot_id, sort_order)
      VALUES ($1, $2, $3, 0)
      RETURNING id
      `,
      [tripId, entryId, spotId],
    )
    const linkId = link.rows[0]?.id
    if (!linkId) throw new Error('link missing')
    const image = await db.pool.query<{ id: string }>(
      `
      INSERT INTO images (trip_id, spot_id, uploaded_by, storage_key, bytes, width, height)
      VALUES ($1, $2, $3, $4, 10, 8, 8)
      RETURNING id
      `,
      [
        tripId,
        spotId,
        owner.user.id,
        `trips/${tripId}/${spotId}/${serial}.webp`,
      ],
    )
    const imageId = image.rows[0]?.id
    if (!imageId) throw new Error('image missing')
    const code = `TST-${String(serial).padStart(4, '0').slice(-4)}`
    const invite = await db.pool.query<{ id: string }>(
      `
      INSERT INTO trip_invites (trip_id, code, role, created_by, created_at, expires_at)
      VALUES ($1, $2, 'visitor', $3, now(), now() + interval '7 days')
      RETURNING id
      `,
      [tripId, code, owner.user.id],
    )
    const inviteId = invite.rows[0]?.id
    if (!inviteId) throw new Error('invite missing')
    return {
      tripId,
      spotId,
      entryId,
      linkId,
      imageId,
      inviteId,
      ids: {
        owner: owner.user.id,
        planner: planner.user.id,
        visitor: visitor.user.id,
        outsider: outsider.user.id,
      },
      cookies: {
        owner: owner.cookie,
        planner: planner.cookie,
        visitor: visitor.cookie,
        outsider: outsider.cookie,
      },
    }
  }

  function nextDiscordId() {
    serial += 1
    return String(serial).padStart(18, '1')
  }
})

type Actor = 'owner' | 'planner' | 'visitor' | 'outsider'

const actors: Actor[] = ['owner', 'planner', 'visitor', 'outsider']

type World = {
  tripId: string
  spotId: string
  entryId: string
  linkId: string
  imageId: string
  inviteId: string
  ids: Record<Actor, string>
  cookies: Record<Actor, string>
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

function memoryStorage(): ObjectStorage {
  const objects = new Map<string, Buffer>()
  return {
    async put(key, body) {
      objects.set(key, Buffer.from(body))
    },
    async delete(key) {
      objects.delete(key)
    },
    async get(key) {
      const body = objects.get(key)
      if (!body) throw new Error('missing object')
      return body
    },
    async exists(key) {
      return objects.has(key)
    },
    async list() {
      return [...objects.keys()]
    },
  }
}
