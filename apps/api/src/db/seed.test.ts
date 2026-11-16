import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from './test-db.js'
import { seedCounts, seedDatabase } from './seed.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('seed', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase()
    await seedDatabase(db.pool)
    await seedDatabase(db.pool)
  }, 60_000)

  afterAll(async () => {
    await db?.pool.end()
    await db?.drop()
  })

  // T-01-03
  it('is idempotent and leaves the seed row counts', async () => {
    const counts = await db.pool.query<{
      users: string
      trips: string
      members: string
      spots: string
      homes: string
      buckets: string
      singles: string
      links: string
      events: string
      metrics: string
      opsCounters: string
      jobRuns: string
    }>(`
      SELECT
        (SELECT count(*) FROM users) AS users,
        (SELECT count(*) FROM trips) AS trips,
        (SELECT count(*) FROM trip_members) AS members,
        (SELECT count(*) FROM spots) AS spots,
        (SELECT count(*) FROM spots WHERE base_category = 'home') AS homes,
        (SELECT count(*) FROM plan_entries WHERE type = 'bucket') AS buckets,
        (SELECT count(*) FROM plan_entries WHERE type = 'single') AS singles,
        (SELECT count(*) FROM plan_entry_spots) AS links,
        (SELECT count(*) FROM activity_events) AS events,
        (SELECT count(*) FROM metrics_daily) AS metrics,
        (SELECT count(*) FROM ops_counters) AS "opsCounters",
        (SELECT count(*) FROM job_runs) AS "jobRuns"
    `)
    expect(counts.rows[0]).toEqual({
      users: String(seedCounts.users),
      trips: String(seedCounts.trips),
      members: String(seedCounts.tripMembers),
      spots: String(seedCounts.spots),
      homes: String(seedCounts.homeSpots),
      buckets: String(seedCounts.buckets),
      singles: String(seedCounts.singles),
      links: String(seedCounts.planEntrySpots),
      events: String(seedCounts.activityEvents),
      metrics: String(seedCounts.metricsDaily),
      opsCounters: String(seedCounts.opsCounters),
      jobRuns: String(seedCounts.jobRuns),
    })
  })

  // T-45-10 seed: one overdue, one failed, one fresh job; geocode has no row
  it('seeds the service health demo data', async () => {
    const runs = await db.pool.query<{
      job: string
      last_result: string
      last_error: string | null
      age_hours: number
    }>(`
      SELECT job, last_result, last_error,
        (extract(epoch FROM now() - last_started_at) / 3600)::float8 AS age_hours
      FROM job_runs ORDER BY job
    `)
    expect(runs.rows.map((row) => row.job)).toEqual([
      'commons',
      'invites',
      'sessions',
    ])
    const byJob = Object.fromEntries(runs.rows.map((row) => [row.job, row]))
    expect(byJob.invites?.last_result).toBe('ok')
    expect(byJob.invites?.age_hours).toBeGreaterThan(71)
    expect(byJob.commons?.last_result).toBe('error')
    expect(byJob.commons?.last_error).toBe('seeded failure')
    expect(byJob.sessions?.last_result).toBe('ok')
    expect(byJob.sessions?.age_hours).toBeLessThan(1)
    const days = await db.pool.query<{ failures: string }>(
      `SELECT count(*) FILTER (WHERE http_5xx > 0 OR http_429 > 0) AS failures
       FROM ops_counters`,
    )
    expect(Number(days.rows[0]?.failures)).toBeGreaterThan(0)
  })
})
