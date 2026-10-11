import type { LightMyRequestResponse } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { deleteOldActivity } from '../housekeeping/jobs.js'
import { backfillMetrics, nextMetricsRun, snapshotDay } from './metrics-job.js'
import { reportCapacityWarnings } from './webhook.js'

const hasDb = Boolean(process.env.DATABASE_URL)
const WEB_ORIGIN = 'http://127.0.0.1:5180'
const now = new Date('2026-06-15T12:00:00.000Z')

describe('metrics schedule', () => {
  it('runs at 00:05 UTC', () => {
    expect(
      nextMetricsRun(new Date('2026-06-01T00:04:00.000Z')).toISOString(),
    ).toBe('2026-06-01T00:05:00.000Z')
    expect(
      nextMetricsRun(new Date('2026-06-01T00:05:00.000Z')).toISOString(),
    ).toBe('2026-06-02T00:05:00.000Z')
    expect(
      nextMetricsRun(new Date('2026-06-01T18:00:00.000Z')).toISOString(),
    ).toBe('2026-06-02T00:05:00.000Z')
  })
})

describe.skipIf(!hasDb)('admin insights', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig
  const posts: string[] = []

  beforeAll(async () => {
    db = await createTestDatabase()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
      DISCORD_CLIENT_ID: 'client-123',
      DISCORD_CLIENT_SECRET: 'secret-456',
      AUTH_SECRET: 'test-auth-secret-value',
      ADMIN_DISCORD_WEBHOOK_URL: 'https://discord.example/webhook',
    })
    app = await buildApp(db.pool, {
      config,
      now: () => now,
      webhookFetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { content: string }
        posts.push(body.content)
        return new Response(null, { status: 204 })
      },
    })
  })

  afterAll(async () => {
    await app?.close()
    await db?.pool.end()
    await db?.drop()
  })

  beforeEach(async () => {
    posts.length = 0
    await db.pool.query(`
      DELETE FROM webhook_notices;
      DELETE FROM metrics_daily;
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
      SET db_capacity_bytes = 1073741824,
          blob_capacity_bytes = 10737418240,
          capacity_warn_pct = 80;
    `)
  })

  it('T-17-01 snapshots a day once and backfills missing days', async () => {
    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL TIME ZONE 'UTC'")
      await client.query(
        `
        INSERT INTO users (id, discord_id, username, created_at)
        VALUES
          ('00000000-0000-0000-0000-000000000011', '100000000000000011', 'old', '2026-05-01T00:00:00Z'),
          ('00000000-0000-0000-0000-000000000012', '100000000000000012', 'older', '2026-04-01T00:00:00Z'),
          ('00000000-0000-0000-0000-000000000013', '100000000000000013', 'today', '2026-05-02T08:00:00Z')
        `,
      )
      await client.query(
        `
        INSERT INTO activity_events (actor_id, action, created_at)
        VALUES
          ('00000000-0000-0000-0000-000000000011', 'user.login', '2026-05-02T09:00:00Z'),
          ('00000000-0000-0000-0000-000000000013', 'user.login', '2026-05-02T10:00:00Z'),
          ('00000000-0000-0000-0000-000000000011', 'user.login', '2026-05-02T11:00:00Z')
        `,
      )
      await client.query('COMMIT')
    } finally {
      client.release()
    }
    await snapshotDay(db.pool, '2026-05-02')
    await snapshotDay(db.pool, '2026-05-02')
    const once = await db.pool.query<{
      users_total: number
      users_new: number
      users_active: number
      events_total: number
    }>(
      'SELECT users_total, users_new, users_active, events_total FROM metrics_daily',
    )
    expect(once.rowCount).toBe(1)
    expect(once.rows[0]).toEqual({
      users_total: 3,
      users_new: 1,
      users_active: 2,
      events_total: 3,
    })

    await db.pool.query('DELETE FROM metrics_daily')
    await db.pool.query('DELETE FROM users')
    await db.pool.query('DELETE FROM activity_events')
    await db.pool.query(
      `
      INSERT INTO users (discord_id, username, created_at)
      VALUES ('100000000000000014', 'span', '2026-05-16T00:00:00Z')
      `,
    )
    await db.pool.query(
      `
      INSERT INTO activity_events (action, created_at)
      SELECT 'spot.create', gs
      FROM generate_series(
        '2026-05-16T12:00:00Z'::timestamptz,
        '2026-06-14T12:00:00Z'::timestamptz,
        interval '1 day'
      ) AS gs
      `,
    )
    expect(await backfillMetrics(db.pool, now)).toBe(30)
    const filled = await db.pool.query(
      'SELECT count(*)::int AS n FROM metrics_daily',
    )
    expect(filled.rows[0]?.n).toBe(30)
    expect(await backfillMetrics(db.pool, now)).toBe(0)
  })

  it('T-17-02 counts active users from last_seen_at', async () => {
    await db.pool.query(
      `
      INSERT INTO users (discord_id, username, last_seen_at)
      VALUES
        ('100000000000000021', 'hour', '2026-06-15T11:00:00Z'),
        ('100000000000000022', 'week', '2026-06-13T12:00:00Z'),
        ('100000000000000023', 'month', '2026-06-05T12:00:00Z'),
        ('100000000000000024', 'old', '2026-05-01T12:00:00Z'),
        ('100000000000000025', 'never', NULL)
      `,
    )
    const admin = await login('100000000000000020')
    const response = await app.inject({
      method: 'GET',
      url: '/admin/stats?range=7d',
      headers: { cookie: admin.cookie },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.active24h).toBe(2)
    expect(body.active7d).toBe(3)
    expect(body.active30d).toBe(4)
    expect(body.usersTotal).toBe(6)
  })

  it('T-17-03 returns metrics in date order and rejects a bad range', async () => {
    await db.pool.query(
      `
      INSERT INTO metrics_daily (
        day, users_total, users_new, users_active, trips_total, spots_total,
        plan_entries_total, images_total, image_bytes_total, db_bytes, events_total
      ) VALUES
        ('2026-06-02', 1, 0, 1, 0, 0, 0, 0, 0, 10, 1),
        ('2026-06-01', 1, 1, 0, 0, 0, 0, 0, 0, 10, 0)
      `,
    )
    const admin = await login('100000000000000030')
    const ok = await app.inject({
      method: 'GET',
      url: '/admin/metrics?from=2026-06-01&to=2026-06-02',
      headers: { cookie: admin.cookie },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().days.map((day: { day: string }) => day.day)).toEqual([
      '2026-06-01',
      '2026-06-02',
    ])
    const backwards = await app.inject({
      method: 'GET',
      url: '/admin/metrics?from=2026-06-02&to=2026-06-01',
      headers: { cookie: admin.cookie },
    })
    expect(backwards.statusCode).toBe(400)
    const huge = await app.inject({
      method: 'GET',
      url: '/admin/metrics?from=2020-01-01&to=2026-01-01',
      headers: { cookie: admin.cookie },
    })
    expect(huge.statusCode).toBe(400)
  })

  it('T-17-04 combines filters and pages without gaps while new events arrive', async () => {
    const aiko = '00000000-0000-0000-0000-000000000041'
    const tom = '00000000-0000-0000-0000-000000000042'
    await db.pool.query(
      `
      INSERT INTO users (id, discord_id, username)
      VALUES ($1, '100000000000000041', 'aiko'), ($2, '100000000000000042', 'tom')
      `,
      [aiko, tom],
    )
    await db.pool.query(
      `
      INSERT INTO activity_events (actor_id, action, created_at)
      SELECT $1, 'spot.create', '2026-06-01T00:00:00Z'::timestamptz + (n || ' minutes')::interval
      FROM generate_series(1, 3) AS n
      `,
      [aiko],
    )
    await db.pool.query(
      `
      INSERT INTO activity_events (actor_id, action, created_at)
      VALUES ($1, 'trip.create', '2026-06-01T00:10:00Z'), ($2, 'spot.update', '2026-06-01T00:11:00Z')
      `,
      [aiko, tom],
    )
    const admin = await login('100000000000000040')
    const filtered = await app.inject({
      method: 'GET',
      url: `/admin/activity?user=${aiko}&action=spot.*`,
      headers: { cookie: admin.cookie },
    })
    expect(filtered.statusCode).toBe(200)
    const events = filtered.json().events as {
      action: string
      actorId: string
    }[]
    expect(events).toHaveLength(3)
    expect(
      events.every(
        (event) => event.actorId === aiko && event.action.startsWith('spot.'),
      ),
    ).toBe(true)

    await db.pool.query('DELETE FROM activity_events')
    await db.pool.query(
      `
      INSERT INTO activity_events (actor_id, action, created_at)
      SELECT $1, 'spot.create', '2026-01-01T00:00:00Z'::timestamptz + (n || ' minutes')::interval
      FROM generate_series(1, 120) AS n
      `,
      [aiko],
    )
    const original = await db.pool.query<{ id: string }>(
      'SELECT id FROM activity_events ORDER BY id',
    )
    const seen: number[] = []
    let cursor: string | null = null
    let page = 0
    while (page < 2 || cursor) {
      const url = cursor
        ? `/admin/activity?cursor=${encodeURIComponent(cursor)}`
        : '/admin/activity'
      if (page === 1) {
        await db.pool.query(
          `
          INSERT INTO activity_events (actor_id, action, created_at)
          VALUES ($1, 'spot.create', '2026-12-01T00:00:00Z')
          `,
          [aiko],
        )
      }
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: admin.cookie },
      })
      expect(response.statusCode).toBe(200)
      const body = response.json() as {
        events: { id: number }[]
        nextCursor: string | null
      }
      seen.push(...body.events.map((event) => event.id))
      cursor = body.nextCursor
      page += 1
      if (!cursor) break
    }
    const expected = original.rows
      .map((row) => Number(row.id))
      .sort((a, b) => b - a)
    expect(seen).toEqual(expected)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('T-17-06 exports the same rows and escapes formula injection', async () => {
    await db.pool.query(
      `
      INSERT INTO users (id, discord_id, username, display_name)
      VALUES ('00000000-0000-0000-0000-000000000061', '100000000000000061', 'eq', '=1+1')
      `,
    )
    await db.pool.query(
      `
      INSERT INTO activity_events (actor_id, action, metadata, created_at)
      VALUES
        ('00000000-0000-0000-0000-000000000061', 'spot.create', '{"spot":"A"}'::jsonb, '2026-06-02T00:00:00Z'),
        ('00000000-0000-0000-0000-000000000061', 'trip.create', '{"trip":"B"}'::jsonb, '2026-06-01T00:00:00Z')
      `,
    )
    const admin = await login('100000000000000060')
    const feed = await app.inject({
      method: 'GET',
      url: '/admin/activity?user=00000000-0000-0000-0000-000000000061',
      headers: { cookie: admin.cookie },
    })
    const csv = await app.inject({
      method: 'GET',
      url: '/admin/activity/export?user=00000000-0000-0000-0000-000000000061',
      headers: { cookie: admin.cookie },
    })
    expect(csv.statusCode).toBe(200)
    expect(String(csv.headers['content-type'])).toContain('text/csv')
    const text = csv.body
    expect(text).toContain("'=1+1")
    const ids = [...text.matchAll(/^(\d+),/gm)].map((match) => Number(match[1]))
    expect(ids).toEqual(
      (feed.json().events as { id: number }[]).map((event) => event.id),
    )
  })

  it('T-17-07 reports storage, one row per table, and no forecast without growth', async () => {
    const user = '00000000-0000-0000-0000-000000000071'
    const trip = '10000000-0000-0000-0000-000000000071'
    const spot = '20000000-0000-0000-0000-000000000071'
    await db.pool.query(
      `
      INSERT INTO users (id, discord_id, username) VALUES ($1, '100000000000000071', 'pic')
      `,
      [user],
    )
    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `
        INSERT INTO trips (id, name, timezone, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat, created_by)
        VALUES ($1, 'Pics', 'UTC', 0, 0, 1, 1, $2)
        `,
        [trip, user],
      )
      await client.query(
        `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [trip, user],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    await db.pool.query(
      `
      WITH s AS (
        INSERT INTO spots (id, trip_id, title, lat, lng, base_category, created_by)
        VALUES ($1, $2, 'Gate', 0.5, 0.5, 'kind', $3)
        RETURNING id, trip_id
      ), k AS (
        INSERT INTO spot_kinds (trip_id, preset, color, symbol, sort_order)
        VALUES ($2, 'must_go', '#E5484D', 'exclamation', 0)
        RETURNING id
      )
      INSERT INTO spot_kind_links (trip_id, spot_id, kind_id)
      SELECT s.trip_id, s.id, k.id FROM s, k
      `,
      [spot, trip, user],
    )
    await db.pool.query(
      `
      INSERT INTO images (trip_id, spot_id, uploaded_by, storage_key, bytes, width, height)
      VALUES ($1, $2, $3, 'key-a', 1200, 10, 10), ($1, $2, $3, 'key-b', 800, 10, 10)
      `,
      [trip, spot, user],
    )
    const admin = await login('100000000000000070')
    const response = await app.inject({
      method: 'GET',
      url: '/admin/storage',
      headers: { cookie: admin.cookie },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.dbBytes).toBeGreaterThan(0)
    expect(body.blobBytes).toBe(2000)
    expect(body.dbFullInDays).toBeNull()
    expect(body.blobFullInDays).toBeNull()
    const tables = await db.pool.query<{ table_name: string }>(
      `
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `,
    )
    const names = (body.tables as { name: string }[])
      .map((table) => table.name)
      .sort()
    expect(names).toEqual(tables.rows.map((row) => row.table_name).sort())
    expect(names).toContain('spots')
  })

  it('T-17-08 flags blob storage in the red when capacity is just above usage', async () => {
    const user = '00000000-0000-0000-0000-000000000081'
    const trip = '10000000-0000-0000-0000-000000000081'
    const spot = '20000000-0000-0000-0000-000000000081'
    await db.pool.query(
      `INSERT INTO users (id, discord_id, username) VALUES ($1, '100000000000000081', 'blob')`,
      [user],
    )
    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `
        INSERT INTO trips (id, name, timezone, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat, created_by)
        VALUES ($1, 'Blob', 'UTC', 0, 0, 1, 1, $2)
        `,
        [trip, user],
      )
      await client.query(
        `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [trip, user],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    await db.pool.query(
      `
      WITH s AS (
        INSERT INTO spots (id, trip_id, title, lat, lng, base_category, created_by)
        VALUES ($1, $2, 'Gate', 0.5, 0.5, 'kind', $3)
        RETURNING id, trip_id
      ), k AS (
        INSERT INTO spot_kinds (trip_id, preset, color, symbol, sort_order)
        VALUES ($2, 'must_go', '#E5484D', 'exclamation', 0)
        RETURNING id
      )
      INSERT INTO spot_kind_links (trip_id, spot_id, kind_id)
      SELECT s.trip_id, s.id, k.id FROM s, k
      `,
      [spot, trip, user],
    )
    await db.pool.query(
      `
      INSERT INTO images (trip_id, spot_id, uploaded_by, storage_key, bytes, width, height)
      VALUES ($1, $2, $3, 'blob-key', 1000, 8, 8)
      `,
      [trip, spot, user],
    )
    await db.pool.query(
      'UPDATE app_settings SET blob_capacity_bytes = 1001, db_capacity_bytes = 1099511627776',
    )
    const admin = await login('100000000000000080')
    const response = await app.inject({
      method: 'GET',
      url: '/admin/stats?range=all',
      headers: { cookie: admin.cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ warning: 'blob', level: 'red' })
  })

  it('T-17-09 posts a capacity warning once per day', async () => {
    await db.pool.query('UPDATE app_settings SET db_capacity_bytes = 1')
    expect(
      await reportCapacityWarnings(db.pool, {
        url: 'https://discord.example/webhook',
        now,
        fetchImpl: async (_url, init) => {
          posts.push(JSON.parse(String(init?.body)).content as string)
          return new Response(null, { status: 204 })
        },
      }),
    ).toBe(1)
    expect(
      await reportCapacityWarnings(db.pool, {
        url: 'https://discord.example/webhook',
        now,
        fetchImpl: async () => new Response(null, { status: 204 }),
      }),
    ).toBe(0)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toContain('Database')
  })

  it('T-17-10 deletes only activity older than 180 days', async () => {
    await db.pool.query(
      `
      INSERT INTO activity_events (action, created_at)
      VALUES
        ('spot.create', $1::timestamptz - interval '181 days'),
        ('spot.update', $1::timestamptz - interval '180 days'),
        ('spot.delete', $1::timestamptz - interval '179 days')
      `,
      [now],
    )
    expect(await deleteOldActivity(db.pool, now)).toBe(1)
    const left = await db.pool.query<{ action: string }>(
      'SELECT action FROM activity_events ORDER BY action',
    )
    expect(left.rows.map((row) => row.action)).toEqual([
      'spot.delete',
      'spot.update',
    ])
  })

  async function login(discordId: string) {
    await db.pool.query(
      `UPDATE users SET app_role = 'admin' WHERE discord_id = $1`,
      [discordId],
    )
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: {
        origin: WEB_ORIGIN,
        'content-type': 'application/json',
      },
      payload: { discordId },
    })
    expect(response.statusCode).toBe(200)
    await db.pool.query(
      `UPDATE users SET app_role = 'admin' WHERE discord_id = $1`,
      [discordId],
    )
    return { cookie: sessionHeader(response) }
  }
})

describe.skipIf(!hasDb)('admin insights load', () => {
  let db: TestDatabase
  let app: FastifyInstance

  beforeAll(async () => {
    db = await createTestDatabase()
    const config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
      DISCORD_CLIENT_ID: 'client-123',
      DISCORD_CLIENT_SECRET: 'secret-456',
      AUTH_SECRET: 'test-auth-secret-value',
    })
    app = await buildApp(db.pool, { config, now: () => now })
    await db.pool.query(`
      INSERT INTO users (discord_id, username, last_seen_at, created_at)
      SELECT (100000000000000000 + g)::text, 'user' || g,
             timestamptz '2026-06-15T12:00:00Z' - (g || ' minutes')::interval,
             timestamptz '2026-01-01T00:00:00Z'
      FROM generate_series(1, 10000) AS g
    `)
    await db.pool.query(`
      INSERT INTO activity_events (action, created_at)
      SELECT 'spot.create',
             timestamptz '2026-06-15T12:00:00Z'
               - ((g % 400) || ' days')::interval
               - ((g / 400) || ' seconds')::interval
      FROM generate_series(1, 1000000) AS g
    `)
    await db.pool.query(
      `UPDATE users SET app_role = 'admin' WHERE discord_id = '100000000000000001'`,
    )
  }, 180_000)

  afterAll(async () => {
    await app?.close()
    await db?.pool.end()
    await db?.drop()
  })

  it('T-17-11 answers stats, activity and storage within 300 ms', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId: '100000000000000001' },
    })
    expect(loginResponse.statusCode).toBe(200)
    const cookie = sessionHeader(loginResponse)
    for (const url of [
      '/admin/stats?range=30d',
      '/admin/activity',
      '/admin/storage',
    ]) {
      await app.inject({ method: 'GET', url, headers: { cookie } })
      const started = performance.now()
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { cookie },
      })
      expect(response.statusCode).toBe(200)
      expect(performance.now() - started).toBeLessThan(300)
    }
  }, 60_000)
})

function sessionHeader(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie']
  const cookies = raw ? (Array.isArray(raw) ? raw : [raw]) : []
  const cookie = cookies.find((value) => value.startsWith('tb_session=')) ?? ''
  const pair = cookie.split(';')[0] ?? ''
  return `tb_session=${pair.slice(pair.indexOf('=') + 1)}`
}
