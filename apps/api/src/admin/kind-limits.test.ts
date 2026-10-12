import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'

const honshu = {
  name: 'Honshu',
  timezone: 'Asia/Tokyo',
  region: { bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 } },
}

type Kind = { id: string; name: string | null; preset: string | null }

describe('kind catalog, limits and requests', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let failCommit = false

  beforeAll(async () => {
    db = await createTestDatabase()
    app = await buildApp(db.pool, {
      config: loadConfig({
        DATABASE_URL: db.url,
        NODE_ENV: 'test',
        WEB_ORIGIN,
      }),
      now: () => new Date('2026-06-01T00:00:00.000Z'),
      beforeAdminCommit: async () => {
        if (failCommit) throw new Error('commit failed')
      },
    })
  })

  afterAll(async () => {
    await app.close()
    await db.pool.end()
    await db.drop()
  })

  beforeEach(async () => {
    failCommit = false
    await db.pool.query(`
      DELETE FROM kind_limit_requests;
      DELETE FROM admin_audit_log;
      DELETE FROM trip_members;
      DELETE FROM trips;
      DELETE FROM activity_events;
      DELETE FROM sessions;
      DELETE FROM users;
      UPDATE app_settings SET default_max_kinds = 12;
    `)
  })

  it('T-29-03 a preset kind is created once with its color and symbol', async () => {
    const { owner, planner, visitor, outsider, tripId } = await setup('2903')
    const coffee = await postKind(owner.cookie, tripId, { preset: 'coffee' })
    expect(coffee.statusCode).toBe(201)
    expect(coffee.json()).toMatchObject({
      name: null,
      preset: 'coffee',
      color: '#A16207',
      symbol: 'coffee',
      sortOrder: 4,
      spotCount: 0,
    })
    const again = await postKind(owner.cookie, tripId, { preset: 'coffee' })
    expect(again.statusCode).toBe(409)
    expect(again.json().error).toBe('kind_preset_taken')
    // A starter preset is already there.
    const starter = await postKind(owner.cookie, tripId, { preset: 'food' })
    expect(starter.statusCode).toBe(409)
    expect(starter.json().error).toBe('kind_preset_taken')

    for (const payload of [
      { preset: 'party' },
      { preset: 'coffee', name: 'x' },
      { preset: 'coffee', color: '#D9480F' },
    ]) {
      const bad = await postKind(owner.cookie, tripId, payload)
      expect(bad.statusCode).toBe(400)
      expect(bad.json().error).toBe('invalid_request')
    }

    const nightlife = await postKind(owner.cookie, tripId, {
      preset: 'nightlife',
    })
    expect(nightlife.statusCode).toBe(201)
    const events = await db.pool.query(
      `SELECT metadata FROM activity_events WHERE action = 'kind.create' ORDER BY id`,
    )
    expect(events.rows.map((row) => row.metadata)).toEqual([
      { name: 'Coffee' },
      { name: 'Nightlife' },
    ])

    // G-3: 401, 403, 404.
    const anonymous = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/kinds`,
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { preset: 'nature' },
    })
    expect(anonymous.statusCode).toBe(401)
    for (const member of [planner, visitor]) {
      const denied = await postKind(member.cookie, tripId, { preset: 'nature' })
      expect(denied.statusCode).toBe(403)
    }
    expect(
      (await postKind(outsider.cookie, tripId, { preset: 'nature' }))
        .statusCode,
    ).toBe(404)
  })

  it('T-29-05 the kind limit follows the default and the trip override', async () => {
    const { owner, tripId, admin } = await setup('2905')
    const listed = await getKinds(owner.cookie, tripId)
    expect(listed).toMatchObject({ limit: 12, count: 4 })

    for (let index = 4; index < 12; index += 1) {
      const filler = await postKind(owner.cookie, tripId, {
        name: `Kind ${index}`,
        color: '#57534E',
      })
      expect(filler.statusCode).toBe(201)
    }
    const thirteenth = await postKind(owner.cookie, tripId, {
      name: 'Too many',
      color: '#57534E',
    })
    expect(thirteenth.statusCode).toBe(409)
    expect(thirteenth.json()).toMatchObject({ error: 'kind_limit', limit: 12 })
    const presetAtLimit = await postKind(owner.cookie, tripId, {
      preset: 'coffee',
    })
    expect(presetAtLimit.statusCode).toBe(409)
    expect(presetAtLimit.json()).toMatchObject({
      error: 'kind_limit',
      limit: 12,
    })

    const override = await patchKindLimit(admin.cookie, tripId, {
      maxKinds: 14,
    })
    expect(override.statusCode).toBe(200)
    expect(override.json()).toEqual({
      effective: 14,
      override: 14,
      default: 12,
      count: 12,
    })
    for (const name of ['A', 'B']) {
      const added = await postKind(owner.cookie, tripId, {
        name,
        color: '#57534E',
      })
      expect(added.statusCode).toBe(201)
    }
    const fifteenth = await postKind(owner.cookie, tripId, {
      name: 'C',
      color: '#57534E',
    })
    expect(fifteenth.statusCode).toBe(409)
    expect(fifteenth.json().limit).toBe(14)
    expect(await getKinds(owner.cookie, tripId)).toMatchObject({
      limit: 14,
      count: 14,
    })

    const cleared = await patchKindLimit(admin.cookie, tripId, {
      maxKinds: null,
    })
    expect(cleared.json()).toMatchObject({ effective: 12, override: null })
    expect(await getKinds(owner.cookie, tripId)).toMatchObject({ limit: 12 })

    // Lowering the default deletes nothing and only blocks new kinds.
    await patchSettings(admin.cookie, { defaultMaxKinds: 3 })
    expect(await getKinds(owner.cookie, tripId)).toMatchObject({
      limit: 3,
      count: 14,
    })
    const blocked = await postKind(owner.cookie, tripId, {
      name: 'D',
      color: '#57534E',
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().limit).toBe(3)
  })

  it('T-29-06 settings and the trip override write audit rows', async () => {
    const { admin, owner, tripId } = await setup('2906')
    const settings = await patchSettings(admin.cookie, { defaultMaxKinds: 20 })
    expect(settings.statusCode).toBe(200)
    expect(settings.json().defaultMaxKinds).toBe(20)
    const read = await app.inject({
      method: 'GET',
      url: '/admin/settings',
      headers: { cookie: admin.cookie },
    })
    expect(read.json().defaultMaxKinds).toBe(20)

    const override = await patchKindLimit(admin.cookie, tripId, {
      maxKinds: 30,
      reason: 'big trip',
    })
    expect(override.statusCode).toBe(200)

    const audit = await db.pool.query(
      `SELECT action, target_trip_id, before, after, reason
       FROM admin_audit_log ORDER BY id`,
    )
    expect(audit.rows).toHaveLength(2)
    expect(audit.rows[0]).toMatchObject({ action: 'settings.update' })
    expect(audit.rows[0].before.defaultMaxKinds).toBe(12)
    expect(audit.rows[0].after.defaultMaxKinds).toBe(20)
    expect(audit.rows[1]).toMatchObject({
      action: 'trip.kind_limit',
      target_trip_id: tripId,
      reason: 'big trip',
    })
    expect(audit.rows[1].before).toMatchObject({
      override: null,
      effective: 20,
    })
    expect(audit.rows[1].after).toMatchObject({ override: 30, effective: 30 })

    const detail = await app.inject({
      method: 'GET',
      url: `/admin/trips/${tripId}`,
      headers: { cookie: admin.cookie },
    })
    expect(detail.statusCode).toBe(200)
    expect(
      detail.json().members.map((member: { role: string }) => member.role),
    ).toContain('admin')
    expect(detail.json().kindLimit).toEqual({
      effective: 30,
      override: 30,
      default: 20,
      count: 4,
    })

    for (const value of [0, 65]) {
      expect(
        (await patchSettings(admin.cookie, { defaultMaxKinds: value }))
          .statusCode,
      ).toBe(400)
      expect(
        (await patchKindLimit(admin.cookie, tripId, { maxKinds: value }))
          .statusCode,
      ).toBe(400)
    }
    expect(
      (await patchKindLimit(admin.cookie, tripId, { maxKinds: 5, extra: 1 }))
        .statusCode,
    ).toBe(400)
    expect(
      (
        await patchKindLimit(
          admin.cookie,
          '00000000-0000-0000-0000-000000000099',
          { maxKinds: 5 },
        )
      ).statusCode,
    ).toBe(404)
    const count = await db.pool.query(
      'SELECT count(*)::int AS n FROM admin_audit_log',
    )
    expect(count.rows[0].n).toBe(2)

    // R-16-01: a normal user (even the trip owner) gets 404.
    expect(
      (await patchSettings(owner.cookie, { defaultMaxKinds: 5 })).statusCode,
    ).toBe(404)
    expect(
      (await patchKindLimit(owner.cookie, tripId, { maxKinds: 5 })).statusCode,
    ).toBe(404)
    const anonymous = await app.inject({
      method: 'PATCH',
      url: `/admin/trips/${tripId}/kind-limit`,
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { maxKinds: 5 },
    })
    expect(anonymous.statusCode).toBe(401)
  })

  it('T-29-07 a board admin or owner requests more kinds', async () => {
    const { owner, boardAdmin, planner, visitor, outsider, tripId } =
      await setup('2907')

    expect((await latest(boardAdmin.cookie, tripId)).json()).toEqual({
      request: null,
    })

    const created = await postRequest(boardAdmin.cookie, tripId, {
      requestedMax: 20,
      message: 'Our trip is big',
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      tripId,
      requestedBy: boardAdmin.user.id,
      requestedMax: 20,
      message: 'Our trip is big',
      status: 'pending',
      decisionNote: null,
      decidedAt: null,
    })
    const events = await db.pool.query(
      `SELECT actor_id, trip_id, entity_id, metadata FROM activity_events
       WHERE action = 'kind.limit_request'`,
    )
    expect(events.rows).toEqual([
      {
        actor_id: boardAdmin.user.id,
        trip_id: tripId,
        entity_id: created.json().id,
        metadata: { count: 20 },
      },
    ])

    const second = await postRequest(owner.cookie, tripId, { requestedMax: 25 })
    expect(second.statusCode).toBe(409)
    expect(second.json().error).toBe('request_pending')
    expect((await latest(owner.cookie, tripId)).json().request.id).toBe(
      created.json().id,
    )

    await db.pool.query(
      `UPDATE kind_limit_requests SET status = 'rejected', decided_at = now()`,
    )
    for (const requestedMax of [12, 11, 65, 0]) {
      const bad = await postRequest(owner.cookie, tripId, { requestedMax })
      expect(bad.statusCode, String(requestedMax)).toBe(400)
      expect(bad.json().error).toBe('invalid_request')
      expect(bad.json().fields.requestedMax).toBeTruthy()
    }
    expect((await postRequest(owner.cookie, tripId, {})).statusCode).toBe(400)
    expect(
      (await postRequest(owner.cookie, tripId, { requestedMax: 13, x: 1 }))
        .statusCode,
    ).toBe(400)
    const ownerOk = await postRequest(owner.cookie, tripId, {
      requestedMax: 13,
    })
    expect(ownerOk.statusCode).toBe(201)

    for (const member of [planner, visitor]) {
      expect(
        (await postRequest(member.cookie, tripId, { requestedMax: 30 }))
          .statusCode,
      ).toBe(403)
      expect((await latest(member.cookie, tripId)).statusCode).toBe(403)
    }
    expect(
      (await postRequest(outsider.cookie, tripId, { requestedMax: 30 }))
        .statusCode,
    ).toBe(404)
    expect((await latest(outsider.cookie, tripId)).statusCode).toBe(404)
    const other = await createTrip(outsider.cookie)
    expect((await latest(boardAdmin.cookie, other)).statusCode).toBe(404)
    expect(
      (await postRequest(boardAdmin.cookie, other, { requestedMax: 30 }))
        .statusCode,
    ).toBe(404)
    const anonymous = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}/kind-limit-requests/latest`,
    })
    expect(anonymous.statusCode).toBe(401)
  })

  it('T-29-08 an admin decision is one transaction with audit and live notice', async () => {
    const { admin, boardAdmin, planner, tripId } = await setup('2908')
    const stream = await app.listen({ port: 0, host: '127.0.0.1' })
    const live = await fetch(`${stream}/trips/${tripId}/events`, {
      headers: { cookie: planner.cookie },
    })
    expect(live.status).toBe(200)
    const reader = live.body!.getReader()
    let text = ''
    const pump = (async () => {
      const decoder = new TextDecoder()
      for (;;) {
        const chunk = await reader.read().catch(() => ({ done: true as const }))
        if (chunk.done) return
        text += decoder.decode(chunk.value, { stream: true })
      }
    })()

    const created = await postRequest(boardAdmin.cookie, tripId, {
      requestedMax: 20,
    })
    const id = created.json().id as string

    const listed = await listRequests(admin.cookie, 'status=pending')
    expect(listed.statusCode).toBe(200)
    expect(listed.json()).toMatchObject({ pendingCount: 1, nextCursor: null })
    expect(listed.json().requests[0]).toMatchObject({
      id,
      tripId,
      tripName: 'Honshu',
      requestedMax: 20,
      currentLimit: 12,
      kindCount: 4,
      status: 'pending',
    })

    // A simulated failure leaves request, trip and audit unchanged.
    failCommit = true
    const failed = await decide(admin.cookie, id, 'approve', { maxKinds: 18 })
    failCommit = false
    expect(failed.statusCode).toBe(500)
    const unchanged = await db.pool.query(
      `SELECT r.status, r.decided_at, t.max_kinds,
              (SELECT count(*)::int FROM admin_audit_log) AS audits
       FROM kind_limit_requests r JOIN trips t ON t.id = r.trip_id`,
    )
    expect(unchanged.rows).toEqual([
      { status: 'pending', decided_at: null, max_kinds: null, audits: 0 },
    ])
    expect(text).not.toContain('kind.limit_update')

    const invalid = await decide(admin.cookie, id, 'approve', { maxKinds: 65 })
    expect(invalid.statusCode).toBe(400)

    const approved = await decide(admin.cookie, id, 'approve', {
      maxKinds: 18,
      note: 'ok',
    })
    expect(approved.statusCode).toBe(200)
    expect(approved.json()).toEqual({ ok: true })
    const row = await db.pool.query(
      `SELECT r.status, r.decided_by, r.decided_at, r.decision_note, t.max_kinds
       FROM kind_limit_requests r JOIN trips t ON t.id = r.trip_id`,
    )
    expect(row.rows[0]).toMatchObject({
      status: 'approved',
      decided_by: admin.user.id,
      decision_note: 'ok',
      max_kinds: 18,
    })
    expect(row.rows[0].decided_at).toBeInstanceOf(Date)
    const audit = await db.pool.query(
      `SELECT action, target_trip_id, before, after, reason FROM admin_audit_log`,
    )
    expect(audit.rows).toHaveLength(1)
    expect(audit.rows[0]).toMatchObject({
      action: 'kind_limit_request.approve',
      target_trip_id: tripId,
      reason: 'ok',
    })
    expect(audit.rows[0].before).toMatchObject({
      effective: 12,
      requestStatus: 'pending',
    })
    expect(audit.rows[0].after).toMatchObject({
      effective: 18,
      override: 18,
      requestStatus: 'approved',
    })
    await waitFor(
      () => text.split('"action":"kind.limit_update"').length - 1 >= 1,
    )
    expect(text.split('"action":"kind.limit_update"').length - 1).toBe(1)
    expect(text).toContain('"resource":"kind"')
    const latestResult = (await latest(boardAdmin.cookie, tripId)).json()
    expect(latestResult.request).toMatchObject({
      status: 'approved',
      decisionNote: 'ok',
    })
    expect((await decide(admin.cookie, id, 'approve', {})).statusCode).toBe(409)
    expect((await getKinds(boardAdmin.cookie, tripId)).limit).toBe(18)

    // Reject keeps the limit and stores the note.
    const next = await postRequest(boardAdmin.cookie, tripId, {
      requestedMax: 30,
    })
    const rejected = await decide(admin.cookie, next.json().id, 'reject', {
      note: 'too many',
    })
    expect(rejected.statusCode).toBe(200)
    const after = await db.pool.query(
      `SELECT r.status, r.decision_note, r.decided_at IS NOT NULL AS decided, t.max_kinds
       FROM kind_limit_requests r JOIN trips t ON t.id = r.trip_id
       WHERE r.id = $1`,
      [next.json().id],
    )
    expect(after.rows[0]).toEqual({
      status: 'rejected',
      decision_note: 'too many',
      decided: true,
      max_kinds: 18,
    })
    expect(
      (
        await db.pool.query(`SELECT action FROM admin_audit_log ORDER BY id`)
      ).rows.map((r) => r.action),
    ).toEqual(['kind_limit_request.approve', 'kind_limit_request.reject'])

    const all = await listRequests(admin.cookie, '')
    expect(all.json().pendingCount).toBe(0)
    expect(all.json().requests).toHaveLength(2)
    expect(
      (
        await decide(
          admin.cookie,
          '00000000-0000-0000-0000-000000000099',
          'reject',
          {},
        )
      ).statusCode,
    ).toBe(404)
    expect((await listRequests(admin.cookie, 'status=bogus')).statusCode).toBe(
      400,
    )
    expect((await listRequests(boardAdmin.cookie, '')).statusCode).toBe(404)
    expect((await decide(boardAdmin.cookie, id, 'reject', {})).statusCode).toBe(
      404,
    )

    await reader.cancel().catch(() => undefined)
    await pump
  })

  async function waitFor(done: () => boolean) {
    const started = Date.now()
    while (!done()) {
      if (Date.now() - started > 5000) throw new Error('timed out')
      await new Promise((resolve) => setTimeout(resolve, 15))
    }
  }

  async function setup(prefix: string) {
    const admin = await login(`${prefix}00`)
    await db.pool.query(`UPDATE users SET app_role = 'admin' WHERE id = $1`, [
      admin.user.id,
    ])
    const owner = await login(`${prefix}01`)
    const tripId = await createTrip(owner.cookie)
    const boardAdmin = await login(`${prefix}02`)
    const planner = await login(`${prefix}03`)
    const visitor = await login(`${prefix}04`)
    const outsider = await login(`${prefix}05`)
    await addMember(tripId, boardAdmin.user.id, 'admin')
    await addMember(tripId, planner.user.id, 'planner')
    await addMember(tripId, visitor.user.id, 'visitor')
    return { admin, owner, boardAdmin, planner, visitor, outsider, tripId }
  }

  async function login(discordId: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: jsonHeaders(''),
      payload: { discordId: discordId.padEnd(18, '0') },
    })
    expect(response.statusCode).toBe(200)
    return {
      cookie: sessionHeader(response),
      user: response.json() as { id: string },
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

  async function getKinds(cookie: string, tripId: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}/kinds`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    return response.json() as { kinds: Kind[]; limit: number; count: number }
  }

  function postKind(cookie: string, tripId: string, payload: object) {
    return app.inject({
      method: 'POST',
      url: `/trips/${tripId}/kinds`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function postRequest(cookie: string, tripId: string, payload: object) {
    return app.inject({
      method: 'POST',
      url: `/trips/${tripId}/kind-limit-requests`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function latest(cookie: string, tripId: string) {
    return app.inject({
      method: 'GET',
      url: `/trips/${tripId}/kind-limit-requests/latest`,
      headers: { cookie },
    })
  }

  function patchSettings(cookie: string, payload: object) {
    return app.inject({
      method: 'PATCH',
      url: '/admin/settings',
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function patchKindLimit(cookie: string, tripId: string, payload: object) {
    return app.inject({
      method: 'PATCH',
      url: `/admin/trips/${tripId}/kind-limit`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function listRequests(cookie: string, query: string) {
    return app.inject({
      method: 'GET',
      url: `/admin/kind-limit-requests?${query}`,
      headers: { cookie },
    })
  }

  function decide(
    cookie: string,
    id: string,
    verb: 'approve' | 'reject',
    payload: object,
  ) {
    return app.inject({
      method: 'POST',
      url: `/admin/kind-limit-requests/${id}/${verb}`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }
})

function jsonHeaders(cookie: string) {
  return {
    cookie,
    origin: WEB_ORIGIN,
    'content-type': 'application/json',
  }
}

function sessionHeader(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie']
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : []
  const session = cookies.find((value) => value.startsWith('tb_session='))
  return (session ?? '').split(';')[0] ?? ''
}
