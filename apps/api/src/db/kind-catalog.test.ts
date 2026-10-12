import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { kindPresets, kindSymbols } from '@tripboard/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrationsDir } from './paths.js'
import { createTestDatabase, type TestDatabase } from './test-db.js'

const hasDb = Boolean(process.env.DATABASE_URL)

const user = '00000000-0000-0000-0000-0000000000c1'
const trip = '10000000-0000-0000-0000-0000000000c1'

const earlier = [
  '0000_tables.sql',
  '0001_rules.sql',
  '0002_webhook.sql',
  '0003_spot_comments.sql',
  '0004_spot_kinds.sql',
]

async function rejects(db: TestDatabase, sql: string, params: unknown[] = []) {
  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')
    try {
      await client.query(sql, params)
      await client.query('COMMIT')
      return false
    } catch {
      await client.query('ROLLBACK')
      return true
    }
  } finally {
    client.release()
  }
}

describe.skipIf(!hasDb)('T-29-04 kind catalog rules', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase()
    await db.pool.query(
      `INSERT INTO users (id, discord_id, username) VALUES ($1, '100000000000000291', 'kim')`,
      [user],
    )
    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO trips (id, name, created_by, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat)
         VALUES ($1, 'A', $2, 0, 0, 1, 1)`,
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
  }, 60_000)

  afterAll(async () => {
    await db?.drop()
  })

  const kind = (preset: string, symbol = 'dot') =>
    db.pool.query(
      `INSERT INTO spot_kinds (trip_id, preset, color, symbol, sort_order)
       VALUES ($1, $2, '#D9480F', $3, 0)`,
      [trip, preset, symbol],
    )

  it('accepts every preset once per trip and rejects a second one', async () => {
    for (const preset of kindPresets) await kind(preset)
    for (const preset of kindPresets) {
      expect(
        await rejects(
          db,
          `INSERT INTO spot_kinds (trip_id, preset, color, symbol, sort_order)
           VALUES ($1, $2, '#D9480F', 'dot', 1)`,
          [trip, preset],
        ),
        preset,
      ).toBe(true)
    }
    expect(
      await rejects(
        db,
        `INSERT INTO spot_kinds (trip_id, preset, color, symbol, sort_order)
         VALUES ($1, 'party', '#D9480F', 'dot', 1)`,
        [trip],
      ),
    ).toBe(true)
  })

  it('keeps the symbol CHECK in sync with kindSymbols', async () => {
    const result = await db.pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conname = 'spot_kinds_symbol_check'`,
    )
    const listed = [
      ...(result.rows[0]?.def ?? '').matchAll(/'([a-z_]+)'::text/g),
    ].map((match) => match[1])
    expect(listed).toEqual([...kindSymbols])
    expect(listed).toHaveLength(64)
  })

  it('limits max_kinds and default_max_kinds to 1..64', async () => {
    for (const value of [0, 65]) {
      expect(
        await rejects(db, 'UPDATE trips SET max_kinds = $1', [value]),
      ).toBe(true)
      expect(
        await rejects(db, 'UPDATE app_settings SET default_max_kinds = $1', [
          value,
        ]),
      ).toBe(true)
    }
    expect(await rejects(db, 'UPDATE trips SET max_kinds = 64')).toBe(false)
    expect(
      await rejects(db, 'UPDATE app_settings SET default_max_kinds = 1'),
    ).toBe(false)
    await db.pool.query(
      'UPDATE trips SET max_kinds = NULL; UPDATE app_settings SET default_max_kinds = 12',
    )
  })

  it('allows one pending kind limit request per trip', async () => {
    const insert = (max: number, status = 'pending', decided = 'NULL') =>
      db.pool.query(
        `INSERT INTO kind_limit_requests (trip_id, requested_max, status, decided_at)
         VALUES ($1, $2, $3, ${decided})`,
        [trip, max, status],
      )
    await insert(20)
    await expect(insert(21)).rejects.toMatchObject({ code: '23505' })
    await expect(insert(21, 'approved')).rejects.toMatchObject({
      code: '23514',
    })
    await expect(insert(21, 'pending', 'now()')).rejects.toMatchObject({
      code: '23514',
    })
    await expect(insert(65, 'approved', 'now()')).rejects.toMatchObject({
      code: '23514',
    })
    await insert(22, 'rejected', 'now()')
    await db.pool.query(
      `UPDATE kind_limit_requests SET status = 'approved', decided_at = now()
       WHERE requested_max = 20`,
    )
    await insert(23)
    await db.pool.query('DELETE FROM trips WHERE id = $1', [trip])
    const left = await db.pool.query('SELECT 1 FROM kind_limit_requests')
    expect(left.rows).toHaveLength(0)
  })
})

describe.skipIf(!hasDb)('T-29-02 migration 0005 on an existing trip', () => {
  it('keeps exactly the old kinds and adds none', async () => {
    const db = await createTestDatabase({ migrate: false })
    try {
      const run = async (file: string) =>
        db.pool.query(readFileSync(join(migrationsDir, file), 'utf8'))
      for (const file of earlier) await run(file)
      await db.pool.query(
        `INSERT INTO users (id, discord_id, username) VALUES ($1, '100000000000000292', 'kim')`,
        [user],
      )
      const client = await db.pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `INSERT INTO trips (id, name, created_by, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat)
           VALUES ($1, 'Old', $2, 0, 0, 1, 1)`,
          [trip, user],
        )
        await client.query(
          `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'owner')`,
          [trip, user],
        )
        await client.query(
          `INSERT INTO spot_kinds (trip_id, preset, color, symbol, sort_order) VALUES
             ($1, 'must_go', '#E5484D', 'exclamation', 0),
             ($1, 'maybe', '#30A46C', 'question', 1)`,
          [trip],
        )
        await client.query('COMMIT')
      } finally {
        client.release()
      }
      const snapshot = () =>
        db.pool.query(
          `SELECT id, preset, color, symbol, sort_order FROM spot_kinds ORDER BY sort_order`,
        )
      const before = await snapshot()
      await run('0005_kind_catalog.sql')
      expect((await snapshot()).rows).toEqual(before.rows)
      const limits = await db.pool.query(
        `SELECT t.max_kinds, s.default_max_kinds FROM trips t CROSS JOIN app_settings s`,
      )
      expect(limits.rows).toEqual([{ max_kinds: null, default_max_kinds: 12 }])
    } finally {
      await db.drop()
    }
  }, 60_000)
})
