import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectedCheckCount, runChecks } from './checks.js'
import { createTestDatabase, type TestDatabase } from './test-db.js'

const hasDb = Boolean(process.env.DATABASE_URL)

const user = '00000000-0000-0000-0000-0000000000c1'
const trip = '10000000-0000-0000-0000-0000000000c1'
const spot = '20000000-0000-0000-0000-0000000000c1'

describe.skipIf(!hasDb)('T-34-12 migration 0006 web photos', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase()
    await db.pool.query(
      `INSERT INTO users (id, discord_id, username) VALUES ($1, '100000000000003412', 'c1')`,
      [user],
    )
    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO trips (id, name, created_by, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat)
         VALUES ($1, 'T', $2, 0, 0, 1, 1)`,
        [trip, user],
      )
      await client.query(
        `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [trip, user],
      )
      await client.query('COMMIT')
    } finally {
      client.release()
    }
    await db.pool.query(
      `INSERT INTO spots (id, trip_id, title, lat, lng, base_category)
       VALUES ($1, $2, 'S', 1, 1, 'home')`,
      [spot, trip],
    )
  }, 60_000)

  afterAll(async () => {
    await db?.pool.end()
    await db?.drop()
  })

  const insertImage = (key: string, columns: Record<string, string> = {}) => {
    const names = [
      'trip_id',
      'spot_id',
      'storage_key',
      'bytes',
      'width',
      'height',
    ]
    const marks = ['$1', '$2', '$3', '1', '1', '1']
    Object.keys(columns).forEach((name, index) => {
      names.push(name)
      marks.push(`$${index + 4}`)
    })
    return db.pool.query(
      `INSERT INTO images (${names.join(', ')}) VALUES (${marks.join(', ')})`,
      [trip, spot, key, ...Object.values(columns)],
    )
  }

  it('adds nullable source_url, credit and license with length checks', async () => {
    const columns = await db.pool.query<{
      column_name: string
      is_nullable: string
    }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'images' AND column_name IN ('source_url', 'credit', 'license')
       ORDER BY column_name`,
    )
    expect(columns.rows).toEqual([
      { column_name: 'credit', is_nullable: 'YES' },
      { column_name: 'license', is_nullable: 'YES' },
      { column_name: 'source_url', is_nullable: 'YES' },
    ])

    await insertImage('k/plain', {})
    await insertImage('k/limits', {
      source_url: 'x'.repeat(2000),
      credit: 'x'.repeat(300),
      license: 'x'.repeat(100),
    })
    await expect(
      insertImage('k/url', { source_url: 'x'.repeat(2001) }),
    ).rejects.toThrow()
    await expect(
      insertImage('k/credit', { credit: 'x'.repeat(301) }),
    ).rejects.toThrow()
    await expect(
      insertImage('k/license', { license: 'x'.repeat(101) }),
    ).rejects.toThrow()
  })

  it('creates commons_cache with its created_at index', async () => {
    const table = await db.pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'commons_cache' ORDER BY column_name`,
    )
    expect(table.rows.map((row) => row.column_name)).toEqual([
      'created_at',
      'point_key',
      'response',
    ])
    const index = await db.pool.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'commons_cache' AND indexname = 'commons_cache_created_at_idx'`,
    )
    expect(index.rows[0]?.indexdef).toContain('(created_at)')
  })

  it('still passes docs/database/checks.sql with the updated count', async () => {
    expect(expectedCheckCount).toBe(77)
    // checks.sql wants an empty database, not the rows seeded above.
    const fresh = await createTestDatabase()
    try {
      await expect(runChecks(fresh.url)).resolves.toBeUndefined()
    } finally {
      await fresh.pool.end()
      await fresh.drop()
    }
  })
})
