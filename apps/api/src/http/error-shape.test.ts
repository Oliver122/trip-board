import { apiErrorBodySchema } from '@tripboard/shared'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'
const MISSING = '00000000-0000-4000-8000-000000000000'
const BAD = 'not-a-uuid'

const japan = {
  name: 'Japan 2026',
  timezone: 'Asia/Tokyo',
  startDate: '2026-04-01',
  endDate: '2026-04-14',
  region: {
    bbox: { minLng: 122.94, minLat: 24.4, maxLng: 145.82, maxLat: 45.55 },
  },
}

type Call = { method: string; url: string; payload?: object }

describe('error shape and params', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig

  beforeAll(async () => {
    db = await createTestDatabase()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
      ADMIN_DISCORD_IDS: '100000000000002601',
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

  it('T-26-12 answers 400 with the standard body for a malformed id', async () => {
    const admin = await login('100000000000002601')
    await db.pool.query(`UPDATE users SET app_role = 'admin' WHERE id = $1`, [
      admin.id,
    ])
    const calls: Call[] = [
      ...[
        'GET /trips/:id',
        'PATCH /trips/:id',
        'DELETE /trips/:id',
        'GET /trips/:id/members',
        'GET /trips/:id/invites',
        'POST /trips/:id/invites',
        'POST /trips/:id/leave',
        'POST /trips/:id/transfer',
        'GET /trips/:id/spots',
        'POST /trips/:id/spots',
        'GET /trips/:id/plan',
        'POST /trips/:id/plan',
        'GET /trips/:id/export',
        'GET /trips/:id/news',
        'POST /trips/:id/news/read',
        'GET /trips/:id/events',
        'DELETE /invites/:id',
        'GET /spots/:id',
        'PATCH /spots/:id',
        'DELETE /spots/:id',
        'GET /spots/:id/images',
        'POST /spots/:id/images',
        'GET /spots/:id/comments',
        'POST /spots/:id/comments',
        'PUT /spots/:id/comments/read',
        'PATCH /comments/:id',
        'DELETE /comments/:id',
        'GET /images/:id',
        'GET /images/:id/file',
        'DELETE /images/:id',
        'PATCH /plan/:id',
        'DELETE /plan/:id',
        'POST /plan/:id/spots',
        'PUT /plan/:id/spots/order',
        'GET /admin/users/:id',
        'PATCH /admin/users/:id/quota',
        'POST /admin/users/:id/suspend',
        'POST /admin/users/:id/unsuspend',
        'PATCH /admin/users/:id/role',
        'POST /admin/users/:id/logout-all',
        'GET /admin/trips/:id',
        'POST /admin/quota-requests/:id/approve',
        'POST /admin/quota-requests/:id/reject',
      ].map((route) => callFor(route, { id: BAD })),
      callFor('PATCH /trips/:id/members/:userId', { id: BAD, userId: MISSING }),
      callFor('PATCH /trips/:id/members/:userId', { id: MISSING, userId: BAD }),
      callFor('DELETE /trips/:id/members/:userId', {
        id: BAD,
        userId: MISSING,
      }),
      callFor('PATCH /plan/:id/spots/:linkId', { id: BAD, linkId: MISSING }),
      callFor('PATCH /plan/:id/spots/:linkId', { id: MISSING, linkId: BAD }),
      callFor('DELETE /plan/:id/spots/:linkId', { id: MISSING, linkId: BAD }),
    ]
    for (const call of calls) {
      const response = await send(call, admin.cookie)
      const label = `${call.method} ${call.url}`
      expect(response.statusCode, label).toBe(400)
      const body = apiErrorBodySchema.parse(response.json())
      expect(body.error, label).toBe('invalid_request')
      expect(Object.values(body.fields ?? {}), label).toEqual(['invalid'])
    }

    const code = await send({ method: 'GET', url: '/join/x' }, admin.cookie)
    expect(code.statusCode).toBe(400)
    expect(code.json()).toEqual({
      error: 'invalid_request',
      fields: { code: 'invalid' },
    })
    const memberKey = await send(
      callFor('PATCH /trips/:id/members/:userId', { id: MISSING, userId: BAD }),
      admin.cookie,
    )
    expect(memberKey.json().fields).toEqual({ id: 'invalid' })
    const linkKey = await send(
      callFor('PATCH /plan/:id/spots/:linkId', { id: MISSING, linkId: BAD }),
      admin.cookie,
    )
    expect(linkKey.json().fields).toEqual({ linkId: 'invalid' })
  })

  it('T-26-13 every 400/401/403/404/409 error body parses as an ApiErrorBody', async () => {
    const owner = await login('100000000000002611')
    const visitor = await login('100000000000002612')
    const stranger = await login('100000000000002613')
    const admin = await login('100000000000002601')
    await db.pool.query(`UPDATE users SET app_role = 'admin' WHERE id = $1`, [
      admin.id,
    ])
    const tripId = await createTrip(owner.cookie)
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'visitor')`,
      [tripId, visitor.id],
    )
    const spot = await db.pool.query<{ id: string }>(
      `
      INSERT INTO spots (trip_id, title, lat, lng, base_category, created_by)
      VALUES ($1, 'Dot', 35.6, 139.7, 'maybe', $2)
      RETURNING id
      `,
      [tripId, owner.id],
    )
    const spotId = spot.rows[0]?.id ?? ''
    const stale = { 'if-unmodified-since': '2020-01-01T00:00:00.000Z' }

    const cases: Array<{
      label: string
      status: number
      call: Call
      cookie?: string
      headers?: Record<string, string>
    }> = [
      // 401
      { label: 'trips 401', status: 401, call: get('/trips') },
      { label: 'spots 401', status: 401, call: get(`/trips/${tripId}/spots`) },
      { label: 'plan 401', status: 401, call: get(`/trips/${tripId}/plan`) },
      {
        label: 'members 401',
        status: 401,
        call: get(`/trips/${tripId}/members`),
      },
      {
        label: 'images 401',
        status: 401,
        call: get(`/spots/${spotId}/images`),
      },
      {
        label: 'comments 401',
        status: 401,
        call: get(`/spots/${spotId}/comments`),
      },
      { label: 'admin 401', status: 401, call: get('/admin/users') },
      // 400
      {
        label: 'trips 400',
        status: 400,
        call: { method: 'POST', url: '/trips', payload: { name: '' } },
        cookie: owner.cookie,
      },
      {
        label: 'spots 400',
        status: 400,
        call: { method: 'POST', url: `/trips/${tripId}/spots`, payload: {} },
        cookie: owner.cookie,
      },
      {
        label: 'plan 400',
        status: 400,
        call: { method: 'POST', url: `/trips/${tripId}/plan`, payload: {} },
        cookie: owner.cookie,
      },
      {
        label: 'members 400',
        status: 400,
        call: callFor('PATCH /trips/:id/members/:userId', {
          id: tripId,
          userId: BAD,
        }),
        cookie: owner.cookie,
      },
      {
        label: 'images 400',
        status: 400,
        call: get(`/images/${BAD}`),
        cookie: owner.cookie,
      },
      {
        label: 'comments 400',
        status: 400,
        call: { method: 'POST', url: `/spots/${spotId}/comments`, payload: {} },
        cookie: owner.cookie,
      },
      {
        label: 'admin 400',
        status: 400,
        call: get(`/admin/users/${BAD}`),
        cookie: admin.cookie,
      },
      // 403
      {
        label: 'trips 403',
        status: 403,
        call: {
          method: 'PATCH',
          url: `/trips/${tripId}`,
          payload: { name: 'x' },
        },
        cookie: visitor.cookie,
      },
      {
        label: 'spots 403',
        status: 403,
        call: { method: 'DELETE', url: `/spots/${spotId}` },
        cookie: visitor.cookie,
      },
      {
        label: 'plan 403',
        status: 403,
        call: { method: 'POST', url: `/trips/${tripId}/plan`, payload: {} },
        cookie: visitor.cookie,
        headers: { origin: 'http://evil.example' },
      },
      {
        label: 'members 403',
        status: 403,
        call: callFor('DELETE /trips/:id/members/:userId', {
          id: tripId,
          userId: owner.id,
        }),
        cookie: visitor.cookie,
      },
      {
        label: 'images 403',
        status: 403,
        call: { method: 'DELETE', url: `/images/${MISSING}` },
        cookie: visitor.cookie,
        headers: { origin: 'http://evil.example' },
      },
      {
        label: 'comments 403',
        status: 403,
        call: { method: 'DELETE', url: `/comments/${MISSING}` },
        cookie: visitor.cookie,
        headers: { origin: 'http://evil.example' },
      },
      {
        label: 'admin 403',
        status: 403,
        call: callFor('POST /admin/users/:id/logout-all', { id: MISSING }),
        cookie: admin.cookie,
        headers: { origin: 'http://evil.example' },
      },
      // 404
      {
        label: 'trips 404',
        status: 404,
        call: get(`/trips/${tripId}`),
        cookie: stranger.cookie,
      },
      {
        label: 'spots 404',
        status: 404,
        call: get(`/spots/${spotId}`),
        cookie: stranger.cookie,
      },
      {
        label: 'plan 404',
        status: 404,
        call: get(`/trips/${tripId}/plan`),
        cookie: stranger.cookie,
      },
      {
        label: 'members 404',
        status: 404,
        call: get(`/trips/${tripId}/members`),
        cookie: stranger.cookie,
      },
      {
        label: 'images 404',
        status: 404,
        call: get(`/images/${MISSING}`),
        cookie: owner.cookie,
      },
      {
        label: 'comments 404',
        status: 404,
        call: get(`/spots/${spotId}/comments`),
        cookie: stranger.cookie,
      },
      {
        label: 'admin 404 for non-admin',
        status: 404,
        call: get(`/admin/users/${MISSING}`),
        cookie: owner.cookie,
      },
      {
        label: 'admin 404',
        status: 404,
        call: get(`/admin/users/${MISSING}`),
        cookie: admin.cookie,
      },
      // 409
      {
        label: 'trips 409',
        status: 409,
        call: {
          method: 'PATCH',
          url: `/trips/${tripId}`,
          payload: { name: 'y' },
        },
        cookie: owner.cookie,
        headers: stale,
      },
      {
        label: 'spots 409',
        status: 409,
        call: {
          method: 'PATCH',
          url: `/spots/${spotId}`,
          payload: { title: 'y' },
        },
        cookie: owner.cookie,
        headers: stale,
      },
    ]
    for (const entry of cases) {
      const response = await send(entry.call, entry.cookie, entry.headers)
      expect(response.statusCode, entry.label).toBe(entry.status)
      const body = apiErrorBodySchema.safeParse(response.json())
      expect(body.success, entry.label).toBe(true)
    }
    const conflict = await send(
      { method: 'PATCH', url: `/trips/${tripId}`, payload: { name: 'y' } },
      owner.cookie,
      stale,
    )
    expect(conflict.json()).toMatchObject({
      error: 'conflict',
      updatedBy: expect.anything(),
      current: expect.anything(),
    })
  })

  it('T-26-11 members and invites still report the stored roles', async () => {
    const owner = await login('100000000000002621')
    const planner = await login('100000000000002622')
    const tripId = await createTrip(owner.cookie)
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'planner')`,
      [tripId, planner.id],
    )
    const members = await send(get(`/trips/${tripId}/members`), owner.cookie)
    expect(members.statusCode).toBe(200)
    const roles = (members.json().members as Array<{ role: string }>).map(
      (member) => member.role,
    )
    expect(roles).toEqual(['owner', 'planner'])

    const invite = await send(
      {
        method: 'POST',
        url: `/trips/${tripId}/invites`,
        payload: { role: 'planner' },
      },
      owner.cookie,
    )
    expect(invite.statusCode).toBe(201)
    expect(invite.json().role).toBe('planner')
    const visitorInvite = await send(
      { method: 'POST', url: `/trips/${tripId}/invites`, payload: {} },
      owner.cookie,
    )
    expect(visitorInvite.json().role).toBe('visitor')
  })

  function get(url: string): Call {
    return { method: 'GET', url }
  }

  function callFor(route: string, params: Record<string, string>): Call {
    const [method = 'GET', template = ''] = route.split(' ')
    const url = template.replace(
      /:(\w+)/g,
      (_, key: string) => params[key] ?? '',
    )
    return { method, url, payload: method === 'GET' ? undefined : {} }
  }

  function send(
    call: Call,
    cookie?: string,
    extra: Record<string, string> = {},
  ) {
    const write = call.method !== 'GET'
    return app.inject({
      method: call.method as 'GET',
      url: call.url,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(write ? { origin: WEB_ORIGIN } : {}),
        ...(call.payload ? { 'content-type': 'application/json' } : {}),
        ...extra,
      },
      payload: call.payload,
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
      id: (response.json() as { id: string }).id,
    }
  }

  async function createTrip(cookie: string) {
    const response = await send(
      { method: 'POST', url: '/trips', payload: japan },
      cookie,
    )
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }
})

function sessionHeader(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  const cookie = list.find((value) => value.startsWith('tb_session=')) ?? ''
  return cookie.split(';')[0] ?? ''
}
