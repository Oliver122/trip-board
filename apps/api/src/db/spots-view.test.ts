import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getSpotDisplay, getUserQuotaUsage } from './queries.js'
import { seedDatabase, seedIds } from './seed.js'
import { createTestDatabase, type TestDatabase } from './test-db.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('view helpers', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase()
    await seedDatabase(db.pool)
  }, 60_000)

  afterAll(async () => {
    await db?.pool.end()
    await db?.drop()
  })

  it('returns planned for a bucket spot and maybe for an unplanned maybe spot', async () => {
    const planned = await getSpotDisplay(db.pool, seedIds.spots.shibuya)
    const maybe = await getSpotDisplay(db.pool, seedIds.spots.nara)
    expect(planned?.displayCategory).toBe('planned')
    expect(maybe?.displayCategory).toBe('maybe')
  })

  it('reads platform quota defaults from user_quota_usage', async () => {
    const quota = await getUserQuotaUsage(db.pool, seedIds.users.sven)
    expect(quota).toMatchObject({
      userId: seedIds.users.sven,
      maxImages: 100,
      maxBytes: 209715200,
      hasOverride: false,
      usedImages: 0,
      usedBytes: 0,
    })
  })
})
