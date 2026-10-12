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

  // T-01-04
  it('returns planned for a bucket spot and kind for an unplanned kind spot', async () => {
    const planned = await getSpotDisplay(db.pool, seedIds.spots.shibuya)
    const kind = await getSpotDisplay(db.pool, seedIds.spots.nara)
    expect(planned?.displayCategory).toBe('planned')
    expect(kind?.displayCategory).toBe('kind')
  })

  it("lists a spot's kinds from spots_view", async () => {
    const result = await db.pool.query<{ kinds: { preset: string }[] }>(
      'SELECT kinds FROM spots_view WHERE id = $1',
      [seedIds.spots.nara],
    )
    expect(result.rows[0]?.kinds.map((kind) => kind.preset)).toEqual(['maybe'])
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
