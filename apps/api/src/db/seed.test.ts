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

  // R-46-10: the schedule demo links, restored by a re-run
  it('seeds and restores the schedule demo links', async () => {
    await db.pool.query(`
      UPDATE plan_entry_spots
      SET visit_date = NULL, visit_time = NULL, info = 'moved', sort_order = 9
      WHERE id::text LIKE '40000000-0000-0000-0000-00000000000%'
    `)
    await seedDatabase(db.pool)
    const links = await db.pool.query(`
      SELECT right(pes.id::text, 1) AS n, pe.title AS entry, s.title AS spot,
        pes.visit_date::text AS date, to_char(pes.visit_time, 'HH24:MI') AS time,
        pes.info, pes.sort_order
      FROM plan_entry_spots pes
      JOIN plan_entries pe ON pe.id = pes.plan_entry_id
      JOIN spots s ON s.id = pes.spot_id
      ORDER BY pes.id
    `)
    expect(links.rows).toEqual([
      {
        n: '1',
        entry: 'Tokyo',
        spot: 'Shibuya Sky',
        date: '2026-04-13',
        time: '18:00',
        info: null,
        sort_order: 0,
      },
      {
        n: '2',
        entry: 'Tokyo',
        spot: 'teamLab Borderless',
        date: '2026-04-14',
        time: null,
        info: null,
        sort_order: 1,
      },
      {
        n: '3',
        entry: 'Kyoto',
        spot: 'Fushimi Inari',
        date: '2026-04-18',
        time: '09:00',
        info: null,
        sort_order: 0,
      },
      {
        n: '4',
        entry: 'Tokyo',
        spot: 'teamLab Borderless',
        date: '2026-04-13',
        time: '10:00',
        info: null,
        sort_order: 2,
      },
      {
        n: '5',
        entry: 'Tokyo',
        spot: 'Hotel Gracery',
        date: '2026-04-13',
        time: null,
        info: null,
        sort_order: 3,
      },
      {
        n: '6',
        entry: 'Tokyo',
        spot: 'Shibuya Sky',
        date: null,
        time: null,
        info: null,
        sort_order: 4,
      },
    ])
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
