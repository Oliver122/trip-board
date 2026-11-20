import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'
const now = new Date('2026-06-15T12:00:00.000Z')
const jobNames = [
  'sessions',
  'invites',
  'geocode',
  'commons',
  'activity',
  'blobs',
  'metrics',
]

describe.skipIf(!process.env.DATABASE_URL)('admin ops', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig

  beforeAll(async () => {
    db = await createTestDatabase()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
      DISCORD_CLIENT_ID: 'client-123',
      DISCORD_CLIENT_SECRET: 'secret-456',
      AUTH_SECRET: 'test-auth-secret-value',
    })
    app = await buildApp(db.pool, { config, now: () => now })
  })

  afterAll(async () => {
    await app?.close()
    await db?.pool.end()
    await db?.drop()
  })

  beforeEach(async () => {
    await db.pool.query(`
      DELETE FROM ops_counters;
      DELETE FROM job_runs;
      DELETE FROM admin_audit_log;
      DELETE FROM blob_deletions;
      DELETE FROM sessions;
      DELETE FROM users;
    `)
  })

  it('T-45-09 returns start time, counters in date order and seven jobs', async () => {
    await db.pool.query(`
      INSERT INTO ops_counters (day, http_5xx, http_429, api_starts) VALUES
        ('2026-06-15', 1, 2, 3),
        ('2026-06-10', 0, 0, 1),
        ('2026-05-20', 4, 5, 6),
        ('2026-03-01', 9, 9, 9)
    `)
    await db.pool.query(`
      INSERT INTO job_runs (job, last_started_at, last_finished_at, last_result, last_error)
      VALUES ('sessions', '2026-06-15T11:00:00Z', '2026-06-15T11:00:01Z', 'error', 'boom')
    `)
    const admin = await login('100000000000000401')
    const ok = await get('/admin/ops?range=7d', admin.cookie)
    expect(ok.statusCode).toBe(200)
    const body = ok.json()
    expect(typeof body.startedAt).toBe('string')
    expect(Number.isNaN(Date.parse(body.startedAt))).toBe(false)
    expect(body.days).toEqual([
      { day: '2026-06-10', http5xx: 0, http429: 0, apiStarts: 1 },
      { day: '2026-06-15', http5xx: 1, http429: 2, apiStarts: 3 },
    ])
    expect(body.jobs.map((job: { job: string }) => job.job)).toEqual(jobNames)
    for (const job of body.jobs) expect(job.intervalMs).toBeGreaterThan(0)
    expect(body.jobs[0]).toMatchObject({
      job: 'sessions',
      lastStartedAt: '2026-06-15T11:00:00.000Z',
      lastFinishedAt: '2026-06-15T11:00:01.000Z',
      lastResult: 'error',
      lastError: 'boom',
    })
    expect(body.jobs[1]).toMatchObject({
      job: 'invites',
      lastStartedAt: null,
      lastFinishedAt: null,
      lastResult: null,
      lastError: null,
    })

    const wide = await get('/admin/ops', admin.cookie)
    expect(wide.json().days.map((day: { day: string }) => day.day)).toEqual([
      '2026-05-20',
      '2026-06-10',
      '2026-06-15',
    ])
    const bad = await get('/admin/ops?range=9x', admin.cookie)
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error).toBe('invalid_request')
  })

  it('T-45-11 runs a job, records it and audits the run', async () => {
    const admin = await login('100000000000000411')
    const response = await post('/admin/ops/jobs/blobs/run', admin.cookie)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ job: 'blobs', result: 'ok' })
    const runs = await db.pool.query<{ last_result: string }>(
      `SELECT last_result FROM job_runs WHERE job = 'blobs'`,
    )
    expect(runs.rows).toEqual([{ last_result: 'ok' }])
    const audit = await db.pool.query<{
      action: string
      before: unknown
      after: unknown
    }>(`SELECT action, before, after FROM admin_audit_log`)
    expect(audit.rows).toEqual([
      {
        action: 'ops.job_run',
        before: null,
        after: { job: 'blobs', result: 'ok' },
      },
    ])
  })

  it('T-45-11 answers 200 with result error when the job fails', async () => {
    const admin = await login('100000000000000412')
    // The blobs task reads blob_deletions first, so a missing table rejects it.
    await db.pool.query('ALTER TABLE blob_deletions RENAME TO blob_deletions_x')
    let response: LightMyRequestResponse
    try {
      response = await post('/admin/ops/jobs/blobs/run', admin.cookie)
    } finally {
      await db.pool.query(
        'ALTER TABLE blob_deletions_x RENAME TO blob_deletions',
      )
    }
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.result).toBe('error')
    expect(body.job).toBe('blobs')
    expect(typeof body.error).toBe('string')
    const runs = await db.pool.query<{
      last_result: string
      last_error: string
    }>(`SELECT last_result, last_error FROM job_runs WHERE job = 'blobs'`)
    expect(runs.rows[0]?.last_result).toBe('error')
    expect(runs.rows[0]?.last_error).toBe(body.error)
    const audit = await db.pool.query(
      `SELECT 1 FROM admin_audit_log WHERE action = 'ops.job_run'`,
    )
    expect(audit.rowCount).toBe(1)
  })

  it('G-3 guards both ops routes', async () => {
    const admin = await login('100000000000000421')
    const user = await login('100000000000000422', false)
    expect(
      (await app.inject({ method: 'GET', url: '/admin/ops' })).statusCode,
    ).toBe(401)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/admin/ops/jobs/blobs/run',
          headers: { origin: WEB_ORIGIN },
        })
      ).statusCode,
    ).toBe(401)
    // requireAppRole hides the admin API from normal users with 404 (T-16-01).
    expect((await get('/admin/ops', user.cookie)).statusCode).toBe(404)
    expect(
      (await post('/admin/ops/jobs/blobs/run', user.cookie)).statusCode,
    ).toBe(404)
    const foreign = await app.inject({
      method: 'POST',
      url: '/admin/ops/jobs/blobs/run',
      headers: { cookie: admin.cookie, origin: 'https://evil.example' },
    })
    expect(foreign.statusCode).toBe(403)
    expect(foreign.json().error).toBe('forbidden_origin')
    const malformed = await post('/admin/ops/jobs/Nope1/run', admin.cookie)
    expect(malformed.statusCode).toBe(400)
    expect(malformed.json().error).toBe('invalid_request')
    const unknown = await post('/admin/ops/jobs/nope/run', admin.cookie)
    expect(unknown.statusCode).toBe(404)
    expect(unknown.json().error).toBe('not_found')
    const audit = await db.pool.query('SELECT 1 FROM admin_audit_log')
    expect(audit.rowCount).toBe(0)
  })

  function get(url: string, cookie: string) {
    return app.inject({ method: 'GET', url, headers: { cookie } })
  }

  function post(url: string, cookie: string) {
    return app.inject({
      method: 'POST',
      url,
      headers: { cookie, origin: WEB_ORIGIN },
    })
  }

  async function login(discordId: string, asAdmin = true) {
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId },
    })
    expect(response.statusCode).toBe(200)
    if (asAdmin) {
      await db.pool.query(
        `UPDATE users SET app_role = 'admin' WHERE discord_id = $1`,
        [discordId],
      )
    }
    return { cookie: sessionHeader(response) }
  }
})

function sessionHeader(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie']
  const cookies = raw ? (Array.isArray(raw) ? raw : [raw]) : []
  const cookie = cookies.find((value) => value.startsWith('tb_session=')) ?? ''
  const pair = cookie.split(';')[0] ?? ''
  return `tb_session=${pair.slice(pair.indexOf('=') + 1)}`
}
