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
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { runJob } from './jobs.js'

const hasDb = Boolean(process.env.DATABASE_URL)

type RunRow = {
  last_started_at: Date
  last_finished_at: Date | null
  last_result: string | null
  last_error: string | null
}

describe.skipIf(!hasDb)('job runs', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase()
  })

  afterAll(async () => {
    await db.drop()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function row(job: string): Promise<RunRow | undefined> {
    const result = await db.pool.query<RunRow>(
      'SELECT * FROM job_runs WHERE job = $1',
      [job],
    )
    return result.rows[0]
  }

  it('T-45-08 records a successful run', async () => {
    const at = new Date('2026-06-15T12:00:00.000Z')
    const result = await runJob(
      db.pool,
      'sessions',
      async () => 3,
      () => at,
    )
    expect(result).toEqual({ job: 'sessions', result: 'ok' })
    expect(await row('sessions')).toMatchObject({
      last_started_at: at,
      last_finished_at: at,
      last_result: 'ok',
      last_error: null,
    })
  })

  it('T-45-08 records a failed run with its message and clears it on the next success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runJob(db.pool, 'invites', () =>
      Promise.reject(new Error('disk full')),
    )
    expect(result).toEqual({
      job: 'invites',
      result: 'error',
      error: 'disk full',
    })
    const failed = await row('invites')
    expect(failed).toMatchObject({
      last_result: 'error',
      last_error: 'disk full',
    })
    expect(failed?.last_started_at).toBeInstanceOf(Date)
    expect(failed?.last_finished_at).toBeInstanceOf(Date)
    await runJob(db.pool, 'invites', async () => 0)
    expect(await row('invites')).toMatchObject({
      last_result: 'ok',
      last_error: null,
    })
  })

  it('T-45-08 logs and does not reject when the upsert fails', async () => {
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      errors.push(String(line))
    })
    const failing = {
      query: vi.fn().mockRejectedValue(new Error('db down')),
    } as unknown as Pool
    const task = vi.fn().mockResolvedValue(undefined)
    await expect(runJob(failing, 'blobs', task)).resolves.toEqual({
      job: 'blobs',
      result: 'ok',
    })
    expect(task).toHaveBeenCalledOnce()
    expect(errors).toHaveLength(2)
    expect(errors.map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({ level: 'error', job: 'blobs' }),
      expect.objectContaining({ level: 'error', job: 'blobs' }),
    ])
  })
})
