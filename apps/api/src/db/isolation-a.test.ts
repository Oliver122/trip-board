import { afterAll, beforeAll, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from './test-db.js'

const hasDb = Boolean(process.env.DATABASE_URL)
const userId = '00000000-0000-0000-0000-0000000000aa'
const tripId = '10000000-0000-0000-0000-0000000000aa'

let db: TestDatabase | undefined

beforeAll(async () => {
  if (!hasDb) return
  db = await createTestDatabase()
  await insertSharedIds(db)
}, 60_000)

afterAll(async () => {
  await db?.pool.end()
  await db?.drop()
})

// T-01-05 (runs in parallel with isolation-b.test.ts, same IDs)
it.skipIf(!hasDb)('writes the shared ids in its own database', async () => {
  const result = await db?.pool.query<{ username: string }>(
    'SELECT username FROM users WHERE id = $1',
    [userId],
  )
  expect(result?.rows[0]?.username).toBe('shared')
})

async function insertSharedIds(database: TestDatabase) {
  const client = await database.pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO users (id, discord_id, username) VALUES ($1, '100000000000000099', 'shared')`,
      [userId],
    )
    await client.query(
      `
      INSERT INTO trips (id, name, created_by, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat)
      VALUES ($1, 'Shared', $2, 0, 0, 1, 1)
      `,
      [tripId, userId],
    )
    await client.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [tripId, userId],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
