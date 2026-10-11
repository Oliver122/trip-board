import type { LightMyRequestResponse } from 'fastify'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { startFakeDiscord, type FakeDiscord } from '../auth/fake-discord.js'
import { loginWithDiscord } from '../auth/login.js'
import { createS3Storage, type ObjectStorage } from '../images/storage.js'
import { listAdminRoutes } from './routes.js'
import { adminUserSorts } from '@tripboard/shared'

const WEB_ORIGIN = 'http://127.0.0.1:5180'
const MB = 1024 * 1024
const ADMIN_DISCORD_ID = '100000000000000161'

describe('admin users and quotas', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig
  let fake: FakeDiscord
  let storage: ObjectStorage
  let now = new Date('2026-06-01T00:00:00.000Z')
  let failCommit = false
  let png: Buffer

  beforeAll(async () => {
    db = await createTestDatabase()
    fake = await startFakeDiscord()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
      DISCORD_CLIENT_ID: 'client-123',
      DISCORD_CLIENT_SECRET: 'secret-456',
      AUTH_SECRET: 'test-auth-secret-value',
      DISCORD_API_ORIGIN: fake.origin,
      ADMIN_DISCORD_IDS: ADMIN_DISCORD_ID,
      S3_BUCKET: 'tripboard-test',
    })
    storage = createS3Storage(config)
    png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 20, g: 20, b: 20 },
      },
    })
      .png()
      .toBuffer()
    app = await buildApp(db.pool, {
      config,
      now: () => now,
      storage,
      beforeAdminCommit: async () => {
        if (failCommit) throw new Error('commit failed')
      },
    })
  })

  afterAll(async () => {
    await app.close()
    await fake.close()
    const keys = await storage.list().catch(() => [])
    await Promise.all(keys.map((key) => storage.delete(key)))
    await db.pool.end()
    await db.drop()
  })

  beforeEach(async () => {
    now = new Date('2026-06-01T00:00:00.000Z')
    failCommit = false
    await db.pool.query(`
      DELETE FROM quota_requests;
      DELETE FROM admin_audit_log;
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
      UPDATE app_settings
      SET uploads_enabled = true,
          signups_enabled = true,
          default_max_images = 100,
          default_max_bytes = 209715200,
          updated_by = NULL;
    `)
  })

  it('T-16-01 hides every admin route from normal users and anonymous callers', async () => {
    const routes = listAdminRoutes(app).filter(
      (route) => route.method !== 'HEAD',
    )
    expect(routes.length).toBeGreaterThanOrEqual(12)
    expect(routes.map((route) => `${route.method} ${route.url}`)).toEqual(
      expect.arrayContaining([
        'GET /admin/users',
        'PATCH /admin/users/:id/quota',
        'POST /admin/users/:id/suspend',
        'PATCH /admin/settings',
        'GET /admin/audit',
      ]),
    )
    const user = await login('100000000000000201')
    for (const route of routes) {
      const url = route.url.replace(
        ':id',
        '00000000-0000-0000-0000-000000000099',
      )
      const anonymous = await app.inject({
        method: route.method as 'GET',
        url,
      })
      expect(anonymous.statusCode, `${route.method} ${url} logged out`).toBe(
        401,
      )
      const normal = await app.inject({
        method: route.method as 'GET',
        url,
        headers: { cookie: user.cookie, origin: WEB_ORIGIN },
      })
      expect(normal.statusCode, `${route.method} ${url} user`).toBe(404)
    }
  })

  it('T-16-02 promotes Discord ids from the env and does not demote them later', async () => {
    const promoted = await finishLogin(
      {
        id: ADMIN_DISCORD_ID,
        username: 'root',
        globalName: 'Root',
        avatar: null,
      },
      'code-admin',
    )
    expect(promoted.statusCode).toBe(302)
    const admin = await db.pool.query<{ app_role: string }>(
      'SELECT app_role FROM users WHERE discord_id = $1',
      [ADMIN_DISCORD_ID],
    )
    expect(admin.rows[0]?.app_role).toBe('admin')

    const otherId = '100000000000000162'
    await finishLogin(
      { id: otherId, username: 'plain', globalName: null, avatar: null },
      'code-plain',
    )
    const plain = await db.pool.query<{ app_role: string }>(
      'SELECT app_role FROM users WHERE discord_id = $1',
      [otherId],
    )
    expect(plain.rows[0]?.app_role).toBe('user')

    const demotedConfig = { ...config, adminDiscordIds: [] as string[] }
    const again = await loginWithDiscord(
      db.pool,
      demotedConfig,
      {
        id: ADMIN_DISCORD_ID,
        username: 'root',
        globalName: 'Root',
        avatar: null,
      },
      '/trips',
      now,
      null,
    )
    expect(again.kind).toBe('ok')
    const still = await db.pool.query<{ app_role: string }>(
      'SELECT app_role FROM users WHERE discord_id = $1',
      [ADMIN_DISCORD_ID],
    )
    expect(still.rows[0]?.app_role).toBe('admin')
  })

  it('T-16-03 searches, filters, sorts, and pages 120 users exactly once', async () => {
    const admin = await adminCookie()
    const ids = await seedUsers()
    const everyone = [...ids, admin.user.id]
    const found = await app.inject({
      method: 'GET',
      url: '/admin/users?q=user-042',
      headers: { cookie: admin.cookie },
    })
    expect(found.statusCode).toBe(200)
    expect(found.json().users).toHaveLength(1)
    expect(found.json().users[0].username).toBe('user-042')

    const byDiscord = await app.inject({
      method: 'GET',
      url: '/admin/users?q=810000000000000042',
      headers: { cookie: admin.cookie },
    })
    expect(
      byDiscord.json().users.map((user: { id: string }) => user.id),
    ).toEqual([ids[42]])

    await expectFilter(admin.cookie, 'admins', [
      ...ids.slice(0, 3),
      admin.user.id,
    ])
    await expectFilter(admin.cookie, 'suspended', ids.slice(3, 8))
    await expectFilter(admin.cookie, 'quota', ids.slice(8, 12))
    await expectFilter(admin.cookie, 'inactive', [
      ...ids.slice(12, 18),
      admin.user.id,
    ])

    for (const sort of adminUserSorts) {
      for (const dir of ['asc', 'desc'] as const) {
        const rows = await pages(admin.cookie, `sort=${sort}&dir=${dir}`)
        expect(rows.map((row) => row.id).sort()).toEqual([...everyone].sort())
        const keys = rows.map((row) => sortValue(row, sort))
        const ordered = [...keys].sort((a, b) => compareSort(a, b, dir))
        expect(keys).toEqual(ordered)
      }
    }
  })

  it('T-16-04 sets an override, audits it, and resets to the defaults', async () => {
    const admin = await adminCookie()
    const aiko = await login('100000000000000164')
    await db.pool.query(
      `UPDATE users SET username = 'aiko', display_name = 'Aiko' WHERE id = $1`,
      [aiko.user.id],
    )
    const set = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${aiko.user.id}/quota`,
      headers: jsonHeaders(admin.cookie),
      payload: { maxImages: 300, maxBytes: 1024 * MB, reason: 'temples' },
    })
    expect(set.statusCode).toBe(200)
    expect(set.json()).toMatchObject({ hasOverride: true, maxImages: 300 })
    const usage = await db.pool.query<{
      max_images: number
      max_bytes: string
      has_override: boolean
    }>(
      'SELECT max_images, max_bytes, has_override FROM user_quota_usage WHERE user_id = $1',
      [aiko.user.id],
    )
    expect(usage.rows[0]).toMatchObject({
      max_images: 300,
      max_bytes: String(1024 * MB),
      has_override: true,
    })
    const audit = await db.pool.query<{
      before: { maxImages: number | null }
      after: { maxBytes: number }
    }>(
      `SELECT before, after FROM admin_audit_log WHERE action = 'user.quota_update'`,
    )
    expect(audit.rows).toHaveLength(1)
    expect(audit.rows[0]?.before.maxImages).toBeNull()
    expect(audit.rows[0]?.after.maxBytes).toBe(1024 * MB)

    const reset = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${aiko.user.id}/quota`,
      headers: jsonHeaders(admin.cookie),
      payload: { reset: true },
    })
    expect(reset.statusCode).toBe(200)
    expect(reset.json()).toMatchObject({
      hasOverride: false,
      maxImages: 100,
      maxBytes: 200 * MB,
    })
  })

  it('T-16-05 lets an upload succeed after the limit is raised', async () => {
    const admin = await adminCookie()
    const owner = await login('100000000000000165')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)
    await app.inject({
      method: 'PATCH',
      url: `/admin/users/${owner.user.id}/quota`,
      headers: jsonHeaders(admin.cookie),
      payload: { maxImages: 0 },
    })
    const blocked = await upload(owner.cookie, spotId)
    expect(blocked.statusCode).toBe(413)
    await app.inject({
      method: 'PATCH',
      url: `/admin/users/${owner.user.id}/quota`,
      headers: jsonHeaders(admin.cookie),
      payload: { maxImages: 5 },
    })
    const allowed = await upload(owner.cookie, spotId)
    expect(allowed.statusCode).toBe(201)
  })

  it('T-16-06 suspends an existing session and blocks the next login', async () => {
    const admin = await adminCookie()
    const tom = await login('100000000000000166')
    const suspended = await app.inject({
      method: 'POST',
      url: `/admin/users/${tom.user.id}/suspend`,
      headers: jsonHeaders(admin.cookie),
      payload: { reason: 'spam' },
    })
    expect(suspended.statusCode).toBe(204)
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: tom.cookie },
    })
    expect(me.statusCode).toBe(401)
    const again = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: jsonHeaders(''),
      payload: { discordId: '100000000000000166' },
    })
    expect(again.statusCode).toBe(403)
    expect(again.json()).toEqual({ error: 'suspended', reason: 'spam' })

    const restored = await app.inject({
      method: 'POST',
      url: `/admin/users/${tom.user.id}/unsuspend`,
      headers: jsonHeaders(admin.cookie),
      payload: {},
    })
    expect(restored.statusCode).toBe(204)
    const back = await login('100000000000000166')
    expect(back.user.id).toBe(tom.user.id)
  })

  it('T-16-07 refuses a self-suspend and demoting the last admin', async () => {
    const admin = await adminCookie()
    const self = await app.inject({
      method: 'POST',
      url: `/admin/users/${admin.user.id}/suspend`,
      headers: jsonHeaders(admin.cookie),
      payload: { reason: 'nope' },
    })
    expect(self.statusCode).toBe(400)
    expect(self.json()).toEqual({ error: 'self' })

    const demote = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${admin.user.id}/role`,
      headers: jsonHeaders(admin.cookie),
      payload: { appRole: 'user' },
    })
    expect(demote.statusCode).toBe(409)
    expect(demote.json()).toEqual({ error: 'last_admin' })
  })

  it('T-16-08 accepts one quota request and rejects a second or an empty one', async () => {
    const user = await login('100000000000000168')
    const created = await app.inject({
      method: 'POST',
      url: '/me/quota-requests',
      headers: jsonHeaders(user.cookie),
      payload: { bytes: 500 * MB, message: 'temples' },
    })
    expect(created.statusCode).toBe(201)
    const second = await app.inject({
      method: 'POST',
      url: '/me/quota-requests',
      headers: jsonHeaders(user.cookie),
      payload: { images: 10 },
    })
    expect(second.statusCode).toBe(409)
    const empty = await app.inject({
      method: 'POST',
      url: '/me/quota-requests',
      headers: jsonHeaders(user.cookie),
      payload: { message: 'more' },
    })
    expect(empty.statusCode).toBe(400)
  })

  it('T-16-09 approves a request in one transaction and rolls back on failure', async () => {
    const admin = await adminCookie()
    const user = await login('100000000000000169')
    const created = await app.inject({
      method: 'POST',
      url: '/me/quota-requests',
      headers: jsonHeaders(user.cookie),
      payload: { bytes: 500 * MB },
    })
    const requestId = created.json().id as string
    failCommit = true
    const failed = await app.inject({
      method: 'POST',
      url: `/admin/quota-requests/${requestId}/approve`,
      headers: jsonHeaders(admin.cookie),
      payload: { bytes: 500 * MB },
    })
    expect(failed.statusCode).toBe(500)
    const pending = await db.pool.query<{
      status: string
      max_bytes: string | null
    }>(
      `
      SELECT r.status, u.max_bytes
      FROM quota_requests r
      JOIN users u ON u.id = r.user_id
      WHERE r.id = $1
      `,
      [requestId],
    )
    expect(pending.rows[0]).toMatchObject({
      status: 'pending',
      max_bytes: null,
    })
    const audits = await db.pool.query('SELECT 1 FROM admin_audit_log')
    expect(audits.rowCount).toBe(0)

    failCommit = false
    const approved = await app.inject({
      method: 'POST',
      url: `/admin/quota-requests/${requestId}/approve`,
      headers: jsonHeaders(admin.cookie),
      payload: { bytes: 500 * MB, note: 'ok' },
    })
    expect(approved.statusCode).toBe(204)
    const usage = await db.pool.query<{
      max_bytes: string
      has_override: boolean
    }>(
      'SELECT max_bytes, has_override FROM user_quota_usage WHERE user_id = $1',
      [user.user.id],
    )
    expect(usage.rows[0]).toMatchObject({
      max_bytes: String(700 * MB),
      has_override: true,
    })
    const row = await db.pool.query<{ status: string; decided_by: string }>(
      'SELECT status, decided_by FROM quota_requests WHERE id = $1',
      [requestId],
    )
    expect(row.rows[0]).toEqual({
      status: 'approved',
      decided_by: admin.user.id,
    })
    const written = await db.pool.query(
      `SELECT 1 FROM admin_audit_log WHERE action = 'quota_request.approve'`,
    )
    expect(written.rowCount).toBe(1)
  })

  it('T-16-10 applies upload and signup switches immediately', async () => {
    const admin = await adminCookie()
    const owner = await login('100000000000000170')
    const tripId = await createTrip(owner.cookie)
    const spotId = await createSpot(owner.cookie, tripId)
    const paused = await app.inject({
      method: 'PATCH',
      url: '/admin/settings',
      headers: jsonHeaders(admin.cookie),
      payload: { uploadsEnabled: false, signupsEnabled: false },
    })
    expect(paused.statusCode).toBe(200)
    const uploadPaused = await upload(owner.cookie, spotId)
    expect(uploadPaused.statusCode).toBe(503)
    expect(uploadPaused.json()).toEqual({
      error: 'uploads_paused',
      message: 'Uploads are paused',
    })

    const unknown = await loginWithDiscord(
      db.pool,
      config,
      {
        id: '100000000000000171',
        username: 'new',
        globalName: null,
        avatar: null,
      },
      '/trips',
      now,
      null,
    )
    expect(unknown.kind).toBe('signups_disabled')
    const known = await loginWithDiscord(
      db.pool,
      config,
      {
        id: '100000000000000170',
        username: 'owner',
        globalName: null,
        avatar: null,
      },
      '/trips',
      now,
      null,
    )
    expect(known.kind).toBe('ok')

    await db.pool.query(
      `
      INSERT INTO trip_invites (trip_id, code, role, created_by)
      VALUES ($1, 'JAP-ABCD', 'visitor', $2)
      `,
      [tripId, owner.user.id],
    )
    const invited = await loginWithDiscord(
      db.pool,
      config,
      {
        id: '100000000000000172',
        username: 'guest',
        globalName: null,
        avatar: null,
      },
      '/join/JAP-ABCD',
      now,
      null,
    )
    expect(invited.kind).toBe('ok')
  })

  it('T-16-11 raises the default only for users without an override', async () => {
    const admin = await adminCookie()
    const plain = await login('100000000000000173')
    const special = await login('100000000000000174')
    await app.inject({
      method: 'PATCH',
      url: `/admin/users/${special.user.id}/quota`,
      headers: jsonHeaders(admin.cookie),
      payload: { maxBytes: 50 * MB },
    })
    const raised = await app.inject({
      method: 'PATCH',
      url: '/admin/settings',
      headers: jsonHeaders(admin.cookie),
      payload: { defaultMaxBytes: 400 * MB },
    })
    expect(raised.statusCode).toBe(200)
    const rows = await db.pool.query<{ user_id: string; max_bytes: string }>(
      'SELECT user_id, max_bytes FROM user_quota_usage WHERE user_id = ANY($1::uuid[])',
      [[plain.user.id, special.user.id]],
    )
    const byId = new Map(rows.rows.map((row) => [row.user_id, row.max_bytes]))
    expect(byId.get(plain.user.id)).toBe(String(400 * MB))
    expect(byId.get(special.user.id)).toBe(String(50 * MB))
  })

  it('T-16-12 shows trip metadata to a non-member and still hides spots', async () => {
    const owner = await login('100000000000000175')
    const admin = await adminCookie()
    const tripId = await createTrip(owner.cookie)
    await createSpot(owner.cookie, tripId)
    const detail = await app.inject({
      method: 'GET',
      url: `/admin/trips/${tripId}`,
      headers: { cookie: admin.cookie },
    })
    expect(detail.statusCode).toBe(200)
    const body = detail.json()
    expect(body.trip.spots).toBe(1)
    expect(body.members).toEqual([
      expect.objectContaining({ id: owner.user.id, role: 'owner' }),
    ])
    expect(body.trip).not.toHaveProperty('spotsList')
    const spots = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}/spots`,
      headers: { cookie: admin.cookie },
    })
    expect(spots.statusCode).toBe(404)
  })

  async function expectFilter(
    cookie: string,
    filter: string,
    expected: string[],
  ) {
    const rows = await pages(cookie, `filter=${filter}&sort=username&dir=asc`)
    expect(rows.map((row) => row.id).sort()).toEqual([...expected].sort())
  }

  async function pages(cookie: string, search: string) {
    const rows: Array<Record<string, string | number | boolean | null>> = []
    let cursor: string | null = null
    for (let page = 0; page < 10; page += 1) {
      const url: string = `/admin/users?${search}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { cookie },
      })
      expect(response.statusCode).toBe(200)
      const body = response.json() as {
        users: Array<Record<string, string | number | boolean | null>>
        nextCursor: string | null
      }
      expect(body.users.length).toBeLessThanOrEqual(50)
      rows.push(...body.users)
      cursor = body.nextCursor
      if (!cursor) break
    }
    expect(cursor).toBeNull()
    return rows
  }

  async function seedUsers() {
    const ids: string[] = []
    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      for (let index = 0; index < 120; index += 1) {
        const discord = `81${String(index).padStart(16, '0')}`
        const role = index < 3 ? 'admin' : 'user'
        const suspended = index >= 3 && index < 8
        const inactive = index >= 12 && index < 18
        const inserted = await client.query<{ id: string }>(
          `
          INSERT INTO users (
            discord_id, username, display_name, app_role, created_at, last_seen_at,
            suspended_at, suspended_reason, max_bytes
          ) VALUES (
            $1, $2, $3, $4,
            now() - ($5::int * interval '1 second'),
            CASE WHEN $6::bool THEN now() - interval '100 days' ELSE now() END,
            CASE WHEN $7::bool THEN now() ELSE NULL END,
            $8, $9
          ) RETURNING id
          `,
          [
            discord,
            `user-${String(index).padStart(3, '0')}`,
            `Name ${index}`,
            role,
            index,
            inactive,
            suspended,
            suspended ? 'seed' : null,
            index >= 8 && index < 12 ? 100 : null,
          ],
        )
        ids.push(inserted.rows[0]!.id)
      }
      const trip = await client.query<{ id: string }>(
        `
        INSERT INTO trips (
          name, created_by, timezone,
          bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat
        ) VALUES ('Seed', $1, 'UTC', 0, 0, 1, 1)
        RETURNING id
        `,
        [ids[0]],
      )
      await client.query(
        `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [trip.rows[0]!.id, ids[0]],
      )
      const spot = await client.query<{ id: string }>(
        `
        WITH s AS (
          INSERT INTO spots (trip_id, title, lat, lng, base_category, created_by)
          VALUES ($1, 'Seed spot', 0, 0, 'kind', $2)
          RETURNING id, trip_id
        ), k AS (
          INSERT INTO spot_kinds (trip_id, preset, color, symbol, sort_order)
          VALUES ($1, 'maybe', '#30A46C', 'question', 0)
          RETURNING id
        ), l AS (
          INSERT INTO spot_kind_links (trip_id, spot_id, kind_id)
          SELECT s.trip_id, s.id, k.id FROM s, k
        )
        SELECT id FROM s
        `,
        [trip.rows[0]!.id, ids[0]],
      )
      for (let index = 8; index < 12; index += 1) {
        await client.query(
          `
          INSERT INTO images (
            trip_id, spot_id, uploaded_by, storage_key, bytes, width, height
          ) VALUES ($1, $2, $3, $4, 80, 8, 8)
          `,
          [
            trip.rows[0]!.id,
            spot.rows[0]!.id,
            ids[index],
            `seed-${index}.webp`,
          ],
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return ids
  }

  async function adminCookie() {
    const user = await login('100000000000000160')
    await db.pool.query(`UPDATE users SET app_role = 'admin' WHERE id = $1`, [
      user.user.id,
    ])
    return user
  }

  async function login(discordId: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: jsonHeaders(''),
      payload: { discordId },
    })
    expect(response.statusCode).toBe(200)
    return {
      cookie: sessionHeader(response),
      user: response.json() as { id: string; username: string },
    }
  }

  async function finishLogin(
    profile: {
      id: string
      username: string
      globalName: string | null
      avatar: string | null
    },
    code: string,
  ) {
    const start = await app.inject({ method: 'GET', url: '/auth/discord' })
    const location = new URL(String(start.headers.location))
    const oauth = headerCookies(start).find((value) =>
      value.startsWith('tb_oauth='),
    )
    fake.issue(code, profile)
    return app.inject({
      method: 'GET',
      url: `/auth/discord/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(location.searchParams.get('state') ?? '')}`,
      headers: { cookie: `tb_oauth=${cookieValue(oauth ?? '')}` },
    })
  }

  async function createTrip(cookie: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: jsonHeaders(cookie),
      payload: {
        name: 'Honshu',
        timezone: 'Asia/Tokyo',
        region: { bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 } },
      },
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  async function createSpot(cookie: string, tripId: string) {
    const response = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/spots`,
      headers: jsonHeaders(cookie),
      payload: {
        title: 'Shrine',
        lat: 35,
        lng: 135,
        baseCategory: 'must_go',
      },
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  function upload(cookie: string, spotId: string) {
    const boundary = '----tripboard'
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    return app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images`,
      headers: {
        cookie,
        origin: WEB_ORIGIN,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    })
  }
})

function sortValue(
  row: Record<string, string | number | boolean | null>,
  sort: string,
): string | number | null {
  if (sort === 'role') return typeof row.appRole === 'string' ? row.appRole : ''
  const value = row[sort]
  if (typeof value === 'number' || typeof value === 'string') return value
  if (sort === 'createdAt' || sort.endsWith('At')) return ''
  return null
}

function compareSort(
  a: string | number | null,
  b: string | number | null,
  dir: 'asc' | 'desc',
) {
  const left = a ?? ''
  const right = b ?? ''
  const order =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right))
  return dir === 'asc' ? order : -order
}

function jsonHeaders(cookie: string) {
  return {
    cookie,
    origin: WEB_ORIGIN,
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
