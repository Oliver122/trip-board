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
        (SELECT count(*) FROM metrics_daily) AS metrics
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
    })
  })
})
