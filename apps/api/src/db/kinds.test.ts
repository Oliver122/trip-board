import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrationsDir } from './paths.js'
import { createTestDatabase, type TestDatabase } from './test-db.js'

const hasDb = Boolean(process.env.DATABASE_URL)

const ids = {
  user: '00000000-0000-0000-0000-0000000000a1',
  tripA: '10000000-0000-0000-0000-0000000000a1',
  tripB: '10000000-0000-0000-0000-0000000000b1',
}

async function insertTrip(client: PoolClient, id: string, name: string) {
  await client.query(
    `INSERT INTO trips (id, name, created_by, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat)
     VALUES ($1, $2, $3, 0, 0, 1, 1)`,
    [id, name, ids.user],
  )
  await client.query(
    `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [id, ids.user],
  )
}

async function insertKind(
  client: PoolClient,
  tripId: string,
  name: string | null,
  sortOrder: number,
  preset: string | null = null,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO spot_kinds (trip_id, name, preset, color, symbol, sort_order)
     VALUES ($1, $2, $3, '#D9480F', 'dot', $4) RETURNING id`,
    [tripId, name, preset, sortOrder],
  )
  return result.rows[0]!.id
}

async function insertSpot(
  client: PoolClient,
  tripId: string,
  base: string,
  kindIds: string[],
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO spots (trip_id, title, lat, lng, base_category)
     VALUES ($1, 'Spot', 0, 0, $2) RETURNING id`,
    [tripId, base],
  )
  const spotId = result.rows[0]!.id
  for (const kindId of kindIds) {
    await client.query(
      `INSERT INTO spot_kind_links (trip_id, spot_id, kind_id) VALUES ($1, $2, $3)`,
      [tripId, spotId, kindId],
    )
  }
  return spotId
}

/** Runs the work in one transaction and reports whether COMMIT was accepted. */
async function commits(
  db: TestDatabase,
  work: (client: PoolClient) => Promise<void>,
): Promise<{ ok: true } | { ok: false; code: string | undefined }> {
  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')
    try {
      await work(client)
      await client.query('COMMIT')
      return { ok: true }
    } catch (error) {
      await client.query('ROLLBACK')
      return { ok: false, code: (error as { code?: string }).code }
    }
  } finally {
    client.release()
  }
}

describe.skipIf(!hasDb)('T-28-03 spot kind rules', () => {
  let db: TestDatabase
  let kindA: string
  let kindA2: string
  let kindB: string

  beforeAll(async () => {
    db = await createTestDatabase()
    await db.pool.query(
      `INSERT INTO users (id, discord_id, username) VALUES ($1, '100000000000000091', 'kim')`,
      [ids.user],
    )
    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET CONSTRAINTS ALL DEFERRED')
      await insertTrip(client, ids.tripA, 'A')
      await insertTrip(client, ids.tripB, 'B')
      kindA = await insertKind(client, ids.tripA, 'Food', 0)
      kindA2 = await insertKind(client, ids.tripA, 'Cafe', 1)
      kindB = await insertKind(client, ids.tripB, 'Food', 0)
      await client.query('COMMIT')
    } finally {
      client.release()
    }
  }, 60_000)

  afterAll(async () => {
    await db?.pool.end()
    await db?.drop()
  })

  it('accepts a spot with one or two kinds and a home spot with none', async () => {
    const result = await commits(db, async (client) => {
      await insertSpot(client, ids.tripA, 'kind', [kindA])
      await insertSpot(client, ids.tripA, 'kind', [kindA, kindA2])
      await insertSpot(client, ids.tripA, 'home', [])
    })
    expect(result).toEqual({ ok: true })
  })

  it('rejects a link to a kind of another trip (FK)', async () => {
    const result = await commits(db, async (client) => {
      await insertSpot(client, ids.tripA, 'kind', [kindB])
    })
    expect(result).toEqual({ ok: false, code: '23503' })
  })

  it('rejects a home spot with a link at commit', async () => {
    const result = await commits(db, async (client) => {
      await insertSpot(client, ids.tripA, 'home', [kindA])
    })
    expect(result).toEqual({ ok: false, code: '23514' })
  })

  it('rejects a non-home spot with no link at commit', async () => {
    const result = await commits(db, async (client) => {
      await insertSpot(client, ids.tripA, 'kind', [])
    })
    expect(result).toEqual({ ok: false, code: '23514' })
  })

  it('rejects a spot with three links at commit', async () => {
    const result = await commits(db, async (client) => {
      const third = await insertKind(client, ids.tripA, 'Museum', 2)
      await insertSpot(client, ids.tripA, 'kind', [kindA, kindA2, third])
    })
    expect(result).toEqual({ ok: false, code: '23514' })
  })

  it('rejects removing the last link and turning a kind spot into home with links', async () => {
    let spotId = ''
    await commits(db, async (client) => {
      spotId = await insertSpot(client, ids.tripA, 'kind', [kindA])
    })
    const removed = await commits(db, async (client) => {
      await client.query('DELETE FROM spot_kind_links WHERE spot_id = $1', [
        spotId,
      ])
    })
    expect(removed).toEqual({ ok: false, code: '23514' })
    const toHome = await commits(db, async (client) => {
      await client.query(
        `UPDATE spots SET base_category = 'home' WHERE id = $1`,
        [spotId],
      )
    })
    expect(toHome).toEqual({ ok: false, code: '23514' })
    const switched = await commits(db, async (client) => {
      await client.query('DELETE FROM spot_kind_links WHERE spot_id = $1', [
        spotId,
      ])
      await client.query(
        `UPDATE spots SET base_category = 'home' WHERE id = $1`,
        [spotId],
      )
    })
    expect(switched).toEqual({ ok: true })
  })

  it('rejects two kinds named Food and food in one trip', async () => {
    const result = await commits(db, async (client) => {
      await insertKind(client, ids.tripA, 'food', 5)
    })
    expect(result).toEqual({ ok: false, code: '23505' })
    const spaced = await commits(db, async (client) => {
      await insertKind(client, ids.tripA, '  FOOD ', 5)
    })
    expect(spaced).toEqual({ ok: false, code: '23505' })
  })

  it('allows the same name in another trip', async () => {
    const result = await commits(db, async (client) => {
      await insertKind(client, ids.tripB, 'Cafe', 5)
    })
    expect(result).toEqual({ ok: true })
  })

  it('rejects a name that is empty after trimming', async () => {
    const result = await commits(db, async (client) => {
      await insertKind(client, ids.tripA, '   ', 6)
    })
    expect(result).toEqual({ ok: false, code: '23514' })
  })

  it('deleting a kind removes its links', async () => {
    let kind = ''
    let spot = ''
    await commits(db, async (client) => {
      kind = await insertKind(client, ids.tripA, 'Temp', 7)
      spot = await insertSpot(client, ids.tripA, 'kind', [kind, kindA])
    })
    const result = await commits(db, async (client) => {
      await client.query('DELETE FROM spot_kinds WHERE id = $1', [kind])
    })
    expect(result).toEqual({ ok: true })
    const links = await db.pool.query(
      'SELECT kind_id FROM spot_kind_links WHERE spot_id = $1',
      [spot],
    )
    expect(links.rows.map((row) => row.kind_id)).toEqual([kindA])
  })
})

function migrationSql(file: string): string {
  return readFileSync(join(migrationsDir, file), 'utf8')
}

describe.skipIf(!hasDb)('migration 0004 on old-style data', () => {
  let db: TestDatabase
  const spotIds = {
    mustA: '20000000-0000-0000-0000-0000000000a1',
    maybeA: '20000000-0000-0000-0000-0000000000a2',
    homeA: '20000000-0000-0000-0000-0000000000a3',
    mustB: '20000000-0000-0000-0000-0000000000b1',
    maybeB: '20000000-0000-0000-0000-0000000000b2',
    emptyTrip: '10000000-0000-0000-0000-0000000000c1',
  }
  const invites = {
    used: '60000000-0000-0000-0000-000000000001',
    fresh: '60000000-0000-0000-0000-000000000002',
  }
  let before: { trip_id: string; count: string }[]

  beforeAll(async () => {
    db = await createTestDatabase({ migrate: false })
    for (const file of [
      '0000_tables.sql',
      '0001_rules.sql',
      '0002_webhook.sql',
      '0003_spot_comments.sql',
    ]) {
      await db.pool.query(migrationSql(file))
    }
    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET CONSTRAINTS ALL DEFERRED')
      await client.query(
        `INSERT INTO users (id, discord_id, username) VALUES ($1, '100000000000000091', 'kim')`,
        [ids.user],
      )
      await insertTrip(client, ids.tripA, 'A')
      await insertTrip(client, ids.tripB, 'B')
      await insertTrip(client, spotIds.emptyTrip, 'Empty')
      await client.query(
        `INSERT INTO spots (id, trip_id, title, lat, lng, base_category) VALUES
           ($1, $4, 'Must A', 0, 0, 'must_go'),
           ($2, $4, 'Maybe A', 0, 0, 'maybe'),
           ($3, $4, 'Home A', 0, 0, 'home'),
           ($5, $6, 'Must B', 0, 0, 'must_go'),
           ($7, $6, 'Maybe B', 0, 0, 'maybe')`,
        [
          spotIds.mustA,
          spotIds.maybeA,
          spotIds.homeA,
          ids.tripA,
          spotIds.mustB,
          ids.tripB,
          spotIds.maybeB,
        ],
      )
      await client.query(
        `INSERT INTO trip_invites (id, trip_id, code, created_by, uses) VALUES
           ($1, $3, 'AAA-1111', $4, 2),
           ($2, $3, 'AAA-2222', $4, 0)`,
        [invites.used, invites.fresh, ids.tripA, ids.user],
      )
      await client.query(
        `INSERT INTO users (id, discord_id, username) VALUES
           ('00000000-0000-0000-0000-0000000000a2', '100000000000000092', 'lee')`,
      )
      await client.query(
        `INSERT INTO trip_members (trip_id, user_id, role, invited_via, joined_at)
         VALUES ($1, '00000000-0000-0000-0000-0000000000a2', 'planner', $2, '2026-01-02T10:00:00Z')`,
        [ids.tripA, invites.used],
      )
      await client.query('COMMIT')
    } finally {
      client.release()
    }
    const counts = await db.pool.query<{ trip_id: string; count: string }>(
      'SELECT trip_id, count(*) FROM spots GROUP BY trip_id ORDER BY trip_id',
    )
    before = counts.rows
    await db.pool.query(migrationSql('0004_spot_kinds.sql'))
  }, 60_000)

  afterAll(async () => {
    await db?.pool.end()
    await db?.drop()
  })

  it('T-28-04 gives every trip exactly the two preset kinds', async () => {
    const result = await db.pool.query<{
      trip_id: string
      presets: string[]
      colors: string[]
      symbols: string[]
    }>(`
      SELECT trip_id,
             array_agg(preset ORDER BY sort_order) AS presets,
             array_agg(color ORDER BY sort_order) AS colors,
             array_agg(symbol ORDER BY sort_order) AS symbols
        FROM spot_kinds GROUP BY trip_id`)
    expect(result.rows).toHaveLength(3)
    for (const row of result.rows) {
      expect(row.presets).toEqual(['must_go', 'maybe'])
      expect(row.colors).toEqual(['#E5484D', '#30A46C'])
      expect(row.symbols).toEqual(['exclamation', 'question'])
    }
  })

  it('T-28-04 links each former must_go / maybe spot to the matching kind', async () => {
    const result = await db.pool.query<{ id: string; presets: string[] }>(`
      SELECT s.id, coalesce(array_agg(k.preset) FILTER (WHERE k.id IS NOT NULL), '{}') AS presets
        FROM spots s
        LEFT JOIN spot_kind_links l ON l.spot_id = s.id
        LEFT JOIN spot_kinds k ON k.id = l.kind_id AND k.trip_id = s.trip_id
       GROUP BY s.id`)
    const byId = new Map(result.rows.map((row) => [row.id, row.presets]))
    expect(byId.get(spotIds.mustA)).toEqual(['must_go'])
    expect(byId.get(spotIds.mustB)).toEqual(['must_go'])
    expect(byId.get(spotIds.maybeA)).toEqual(['maybe'])
    expect(byId.get(spotIds.maybeB)).toEqual(['maybe'])
    expect(byId.get(spotIds.homeA)).toEqual([])
  })

  it('T-28-04 keeps the spot counts and display colors', async () => {
    const counts = await db.pool.query<{ trip_id: string; count: string }>(
      'SELECT trip_id, count(*) FROM spots GROUP BY trip_id ORDER BY trip_id',
    )
    expect(counts.rows).toEqual(before)
    const view = await db.pool.query<{
      id: string
      display_category: string
      color: string | null
    }>(
      `SELECT id, display_category, kinds -> 0 ->> 'color' AS color FROM spots_view`,
    )
    const byId = new Map(view.rows.map((row) => [row.id, row]))
    expect(byId.get(spotIds.mustA)).toMatchObject({
      display_category: 'kind',
      color: '#E5484D',
    })
    expect(byId.get(spotIds.maybeB)).toMatchObject({
      display_category: 'kind',
      color: '#30A46C',
    })
    expect(byId.get(spotIds.homeA)).toMatchObject({
      display_category: 'home',
      color: null,
    })
  })

  it('T-28-24 marks an invite with uses = 2 as used and keeps uses = 0 valid', async () => {
    const result = await db.pool.query<{
      id: string
      used_at: Date | null
      used_by: string | null
    }>('SELECT id, used_at, used_by FROM trip_invites')
    const byId = new Map(result.rows.map((row) => [row.id, row]))
    const used = byId.get(invites.used)
    expect(used?.used_at).not.toBeNull()
    expect(used?.used_by).toBe('00000000-0000-0000-0000-0000000000a2')
    expect(used?.used_at?.toISOString()).toBe('2026-01-02T10:00:00.000Z')
    expect(byId.get(invites.fresh)).toEqual({
      id: invites.fresh,
      used_at: null,
      used_by: null,
    })
    const columns = await db.pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trip_invites' AND column_name = 'uses'`,
    )
    expect(columns.rowCount).toBe(0)
  })

  it('T-28-24 accepts the new admin role', async () => {
    const result = await db.pool.query<{ role: string }>(
      `SELECT unnest(enum_range(NULL::trip_role))::text AS role`,
    )
    expect(result.rows.map((row) => row.role)).toEqual([
      'owner',
      'admin',
      'planner',
      'visitor',
    ])
  })
})
