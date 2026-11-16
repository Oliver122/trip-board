import type { Pool } from 'pg'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { RequestLimiter } from '../http/limit.js'

const hasDb = Boolean(process.env.DATABASE_URL)
const now = new Date('2026-06-15T12:00:00.000Z')
const today = '2026-06-15'

type CounterRow = {
  http_5xx: number
  http_429: number
  api_starts: number
}

describe.skipIf(!hasDb)('service health counters', () => {
  let db: TestDatabase
  let config: AppConfig

  beforeAll(async () => {
    db = await createTestDatabase()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN: 'http://127.0.0.1:5180',
      DISCORD_CLIENT_ID: 'client-123',
      DISCORD_CLIENT_SECRET: 'secret-456',
      AUTH_SECRET: 'test-auth-secret-value',
    })
  })

  afterAll(async () => {
    await db.drop()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function row(): Promise<CounterRow | undefined> {
    const result = await db.pool.query<CounterRow>(
      'SELECT http_5xx, http_429, api_starts FROM ops_counters WHERE day = $1',
      [today],
    )
    return result.rows[0]
  }

  it('T-45-06 creates ops_counters and job_runs with keys, defaults and checks', async () => {
    const pk = await db.pool.query<{ table_name: string; columns: string }>(
      `
      SELECT tc.table_name, string_agg(kcu.column_name, ',') AS columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name IN ('ops_counters', 'job_runs')
      GROUP BY tc.table_name ORDER BY tc.table_name
      `,
    )
    expect(pk.rows).toEqual([
      { table_name: 'job_runs', columns: 'job' },
      { table_name: 'ops_counters', columns: 'day' },
    ])
    await db.pool.query(`INSERT INTO ops_counters (day) VALUES ('2025-01-01')`)
    const defaults = await db.pool.query<CounterRow>(
      `SELECT http_5xx, http_429, api_starts FROM ops_counters WHERE day = '2025-01-01'`,
    )
    expect(defaults.rows[0]).toEqual({
      http_5xx: 0,
      http_429: 0,
      api_starts: 0,
    })
    for (const column of ['http_5xx', 'http_429', 'api_starts']) {
      await expect(
        db.pool.query(
          `INSERT INTO ops_counters (day, ${column}) VALUES ('2025-01-02', -1)`,
        ),
      ).rejects.toThrow()
    }
    await expect(
      db.pool.query(
        `INSERT INTO job_runs (job, last_started_at, last_result) VALUES ('sessions', now(), 'maybe')`,
      ),
    ).rejects.toThrow()
    await db.pool.query(
      `INSERT INTO job_runs (job, last_started_at, last_result) VALUES ('sessions', now(), 'ok')`,
    )
    await db.pool.query('DELETE FROM job_runs')
    await db.pool.query('DELETE FROM ops_counters')
  })

  it('T-45-07 counts API starts, 5xx and 429 per UTC day and survives a failing pool', async () => {
    const first = await buildApp(db.pool, { config, now: () => now })
    const second = await buildApp(db.pool, { config, now: () => now })
    await first.close()
    await second.close()
    expect((await row())?.api_starts).toBe(2)

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const app = await buildApp(db.pool, {
      config,
      now: () => now,
      limiter: new RequestLimiter(1),
    })
    expect((await app.inject('/test/boom')).statusCode).toBe(500)
    expect((await app.inject('/test/ping')).statusCode).toBe(429)
    // Not flushed yet
    expect((await row())?.http_5xx).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.waitFor(async () => {
      expect(await row()).toMatchObject({ http_5xx: 1, http_429: 1 })
    })
    await app.close()
  })

  it('T-45-07 logs one JSON error line when the flush fails and requests still answer', async () => {
    const failing = {
      query: vi.fn().mockRejectedValue(new Error('ops down')),
    } as unknown as Pool
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      errors.push(String(line))
    })
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const app = await buildApp(db.pool, {
      config,
      now: () => now,
      opsPool: failing,
    })
    // the failed start insert is logged and the boot went on
    expect(errors).toHaveLength(1)
    expect(JSON.parse(errors[0] ?? '{}')).toMatchObject({
      level: 'error',
      msg: 'ops_counters start failed',
    })
    errors.length = 0
    expect((await app.inject('/test/boom')).statusCode).toBe(500)
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1)
    })
    expect(JSON.parse(errors[0] ?? '{}')).toMatchObject({
      level: 'error',
      msg: 'ops_counters flush failed',
      err: 'ops down',
    })
    expect((await app.inject('/test/ping')).statusCode).toBe(200)
    errors.length = 0
    await app.close()
  })
})
