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
import { reportCapacityWarnings } from './webhook.js'

const hasDb = Boolean(process.env.DATABASE_URL)
const now = new Date('2026-06-15T12:00:00.000Z')

describe.skipIf(!hasDb)('webhook timeout', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(async () => {
    await db?.pool.end()
    await db?.drop()
  })

  it('T-44-05 aborts a hanging webhook post after 5 s instead of hanging', async () => {
    await db.pool.query('UPDATE app_settings SET db_capacity_bytes = 1')
    let signal: AbortSignal | undefined
    let posted: () => void = () => undefined
    const begun = new Promise<void>((resolve) => {
      posted = resolve
    })
    const hanging: typeof fetch = (_url, init) => {
      signal = init?.signal ?? undefined
      posted()
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal?.reason))
      })
    }
    // The pool query needs real timers; only the abort timer is faked.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const outcome = reportCapacityWarnings(db.pool, {
      url: 'https://discord.example/webhook',
      now,
      fetchImpl: hanging,
    }).then(
      () => 'resolved',
      (error: unknown) => (error instanceof Error ? error.name : 'rejected'),
    )
    await begun
    await vi.advanceTimersByTimeAsync(4999)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signal?.aborted).toBe(true)
    // Rejects like any failed post; housekeeping's run() logs it (console.error JSON).
    expect(await outcome).not.toBe('resolved')
    // Nothing was marked sent, so the next run posts again.
    const sent = await db.pool.query('SELECT 1 FROM webhook_notices')
    expect(sent.rowCount).toBe(0)
  })
})
