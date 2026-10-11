import {
  isKindSymbol,
  kindLimits,
  normalizeKindColor,
  spotKindSchema,
  type CreateKindBody,
  type KindPreset,
  type PatchKindBody,
  type SpotCategoryInput,
  type SpotKind,
} from '@tripboard/shared'
import type { Pool, PoolClient } from 'pg'
import { activity } from '../activity/record.js'
import { withTransaction } from '../db/transaction.js'
import { requireTripRole } from '../trips/roles.js'

type Queryable = Pool | PoolClient

type KindRow = {
  id: string
  name: string | null
  preset: KindPreset | null
  color: string
  symbol: string
  sort_order: number
  spot_count: number
}

export type KindFailure =
  | { ok: false; status: 403 | 404 }
  | {
      ok: false
      status: 400 | 409
      error: string
      fields?: Record<string, string>
    }

const presetNames: Record<KindPreset, string> = {
  must_go: 'Must go',
  maybe: 'Maybe',
}

const kindSelect = `
SELECT
  k.id,
  k.name,
  k.preset,
  k.color,
  k.symbol,
  k.sort_order,
  (SELECT count(*)::int FROM spot_kind_links l WHERE l.kind_id = k.id) AS spot_count
FROM spot_kinds k
`

function displayName(row: { name: string | null; preset: KindPreset | null }) {
  return row.name ?? (row.preset ? presetNames[row.preset] : '')
}

function rowToKind(row: KindRow): SpotKind {
  return spotKindSchema.parse({
    id: row.id,
    name: row.name,
    preset: row.preset,
    color: row.color,
    symbol: row.symbol,
    sortOrder: row.sort_order,
    spotCount: Number(row.spot_count),
  })
}

export async function loadKinds(
  db: Queryable,
  tripId: string,
): Promise<SpotKind[]> {
  const result = await db.query<KindRow>(
    `${kindSelect} WHERE k.trip_id = $1 ORDER BY k.sort_order, k.created_at, k.id`,
    [tripId],
  )
  return result.rows.map(rowToKind)
}

async function loadKind(
  db: Queryable,
  tripId: string,
  kindId: string,
): Promise<SpotKind | null> {
  const result = await db.query<KindRow>(
    `${kindSelect} WHERE k.trip_id = $1 AND k.id = $2`,
    [tripId, kindId],
  )
  const row = result.rows[0]
  return row ? rowToKind(row) : null
}

export async function listKinds(
  db: Queryable,
  tripId: string,
  userId: string,
): Promise<{ ok: true; kinds: SpotKind[] } | { ok: false; status: 403 | 404 }> {
  const access = await requireTripRole(db, tripId, userId, 'visitor')
  if (!access.ok) return access
  return { ok: true, kinds: await loadKinds(db, tripId) }
}

/** Serializes kind writes of one trip. */
async function lockTrip(tx: PoolClient, tripId: string): Promise<void> {
  await tx.query('SELECT 1 FROM trips WHERE id = $1 FOR UPDATE', [tripId])
}

function nameTaken(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}

const taken: KindFailure = {
  ok: false,
  status: 409,
  error: 'kind_name_taken',
}

export async function createKind(
  pool: Pool,
  userId: string,
  tripId: string,
  input: CreateKindBody,
): Promise<{ ok: true; kind: SpotKind } | KindFailure> {
  const symbol = input.symbol ?? 'dot'
  if (!isKindSymbol(symbol)) {
    return { ok: false, status: 400, error: 'kind_symbol_unknown' }
  }
  try {
    return await withTransaction(pool, async (tx) => {
      const access = await requireTripRole(tx, tripId, userId, 'admin')
      if (!access.ok) return access
      await lockTrip(tx, tripId)
      const stats = await tx.query<{ total: number; next: number }>(
        `
        SELECT count(*)::int AS total, COALESCE(max(sort_order) + 1, 0)::int AS next
        FROM spot_kinds WHERE trip_id = $1
        `,
        [tripId],
      )
      const { total = 0, next = 0 } = stats.rows[0] ?? {}
      if (total >= kindLimits.perTrip) {
        return { ok: false as const, status: 409 as const, error: 'kind_limit' }
      }
      const name = input.name.trim()
      const inserted = await tx.query<{ id: string }>(
        `
        INSERT INTO spot_kinds (trip_id, name, color, symbol, sort_order)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        `,
        [tripId, name, normalizeKindColor(input.color), symbol, next],
      )
      const id = inserted.rows[0]?.id
      if (!id) throw new Error('kind insert failed')
      await activity.record(tx, {
        actor: userId,
        trip: tripId,
        action: 'kind.create',
        entityId: id,
        metadata: { name },
      })
      const kind = await loadKind(tx, tripId, id)
      if (!kind) throw new Error('kind missing after insert')
      return { ok: true as const, kind }
    })
  } catch (error) {
    if (nameTaken(error)) return taken
    throw error
  }
}

export async function updateKind(
  pool: Pool,
  userId: string,
  tripId: string,
  kindId: string,
  patch: PatchKindBody,
): Promise<{ ok: true; kind: SpotKind } | KindFailure> {
  if (patch.symbol !== undefined && !isKindSymbol(patch.symbol)) {
    return { ok: false, status: 400, error: 'kind_symbol_unknown' }
  }
  try {
    return await withTransaction(pool, async (tx) => {
      const access = await requireTripRole(tx, tripId, userId, 'admin')
      if (!access.ok) return access
      await lockTrip(tx, tripId)
      const current = await loadKind(tx, tripId, kindId)
      if (!current) return { ok: false as const, status: 404 as const }
      const name = patch.name !== undefined ? patch.name.trim() : current.name
      const color =
        patch.color !== undefined
          ? normalizeKindColor(patch.color)
          : current.color
      const symbol = patch.symbol ?? current.symbol
      await tx.query(
        `UPDATE spot_kinds SET name = $2, color = $3, symbol = $4 WHERE id = $1`,
        [kindId, name, color, symbol],
      )
      await activity.record(tx, {
        actor: userId,
        trip: tripId,
        action: 'kind.update',
        entityId: kindId,
        metadata: { name: name ?? displayName(current) },
      })
      const kind = await loadKind(tx, tripId, kindId)
      if (!kind) throw new Error('kind missing after update')
      return { ok: true as const, kind }
    })
  } catch (error) {
    if (nameTaken(error)) return taken
    throw error
  }
}

export async function reorderKinds(
  pool: Pool,
  userId: string,
  tripId: string,
  ids: string[],
): Promise<{ ok: true; kinds: SpotKind[] } | KindFailure> {
  return withTransaction(pool, async (tx) => {
    const access = await requireTripRole(tx, tripId, userId, 'admin')
    if (!access.ok) return access
    await lockTrip(tx, tripId)
    const existing = await tx.query<{ id: string }>(
      'SELECT id FROM spot_kinds WHERE trip_id = $1',
      [tripId],
    )
    const known = new Set(existing.rows.map((row) => row.id))
    const wanted = new Set(ids.map((id) => id.toLowerCase()))
    const exact =
      wanted.size === ids.length &&
      ids.length === known.size &&
      ids.every((id) => known.has(id.toLowerCase()))
    if (!exact) {
      return {
        ok: false as const,
        status: 400 as const,
        error: 'invalid_request',
        fields: { ids: 'invalid' },
      }
    }
    await tx.query(
      `
      UPDATE spot_kinds k
      SET sort_order = o.position - 1
      FROM unnest($2::uuid[]) WITH ORDINALITY AS o (id, position)
      WHERE k.id = o.id AND k.trip_id = $1
      `,
      [tripId, ids.map((id) => id.toLowerCase())],
    )
    await activity.record(tx, {
      actor: userId,
      trip: tripId,
      action: 'kind.reorder',
      metadata: { count: ids.length },
    })
    return { ok: true as const, kinds: await loadKinds(tx, tripId) }
  })
}

export async function deleteKind(
  pool: Pool,
  userId: string,
  tripId: string,
  kindId: string,
  moveTo: string | null,
): Promise<{ ok: true } | KindFailure> {
  return withTransaction(pool, async (tx) => {
    const access = await requireTripRole(tx, tripId, userId, 'admin')
    if (!access.ok) return access
    await lockTrip(tx, tripId)
    const current = await loadKind(tx, tripId, kindId)
    if (!current) return { ok: false as const, status: 404 as const }
    const total = await tx.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM spot_kinds WHERE trip_id = $1',
      [tripId],
    )
    if (Number(total.rows[0]?.total ?? 0) <= 1) {
      return { ok: false as const, status: 409 as const, error: 'kind_last' }
    }
    if (moveTo !== null && moveTo.toLowerCase() === kindId.toLowerCase()) {
      return {
        ok: false as const,
        status: 400 as const,
        error: 'kind_move_same',
      }
    }
    const target = moveTo ? await loadKind(tx, tripId, moveTo) : null
    if (moveTo !== null && !target) {
      return { ok: false as const, status: 404 as const }
    }
    if (current.spotCount > 0 && !target) {
      return {
        ok: false as const,
        status: 400 as const,
        error: 'kind_move_required',
      }
    }
    if (target && current.spotCount > 0) {
      await tx.query(
        `
        INSERT INTO spot_kind_links (trip_id, spot_id, kind_id)
        SELECT trip_id, spot_id, $2 FROM spot_kind_links WHERE kind_id = $1
        ON CONFLICT DO NOTHING
        `,
        [kindId, target.id],
      )
      // A kind change counts as an edit for conflict detection.
      await tx.query(
        `
        UPDATE spots SET updated_at = now()
        WHERE id IN (SELECT spot_id FROM spot_kind_links WHERE kind_id = $1)
        `,
        [kindId],
      )
    }
    await tx.query('DELETE FROM spot_kinds WHERE id = $1', [kindId])
    await tx.query(
      `
      UPDATE spot_kinds k
      SET sort_order = r.position - 1
      FROM (
        SELECT id, row_number() OVER (ORDER BY sort_order, created_at, id) AS position
        FROM spot_kinds WHERE trip_id = $1
      ) r
      WHERE k.id = r.id AND k.sort_order <> r.position - 1
      `,
      [tripId],
    )
    await activity.record(tx, {
      actor: userId,
      trip: tripId,
      action: 'kind.delete',
      entityId: kindId,
      metadata: {
        name: displayName(current),
        movedTo: target ? displayName(target) : null,
        moved: current.spotCount,
      },
    })
    return { ok: true as const }
  })
}

export type ResolvedKinds =
  | { ok: true; home: true }
  | { ok: true; home: false; kindIds: string[] }
  | {
      ok: false
      status: 400
      error?: string
      fields: Record<string, string>
    }

/**
 * The kinds a spot write asks for: `kindIds` of this trip, or a `category`
 * (`home`, or a preset name mapped to the trip's preset kind).
 */
export async function resolveKinds(
  db: Queryable,
  tripId: string,
  input: { kindIds?: string[]; category?: SpotCategoryInput },
): Promise<ResolvedKinds> {
  if (input.kindIds !== undefined) {
    const ids = input.kindIds.map((id) => id.toLowerCase())
    const found = await db.query<{ id: string }>(
      'SELECT id FROM spot_kinds WHERE trip_id = $1 AND id = ANY($2::uuid[])',
      [tripId, ids],
    )
    if (found.rows.length !== ids.length) {
      return {
        ok: false,
        status: 400,
        fields: { kindIds: 'invalid' },
      }
    }
    return { ok: true, home: false, kindIds: ids }
  }
  if (input.category === 'home') return { ok: true, home: true }
  const preset = await db.query<{ id: string }>(
    'SELECT id FROM spot_kinds WHERE trip_id = $1 AND preset = $2',
    [tripId, input.category],
  )
  const id = preset.rows[0]?.id
  if (!id) {
    return {
      ok: false,
      status: 400,
      error: 'kind_not_found',
      fields: { category: 'kind_not_found' },
    }
  }
  return { ok: true, home: false, kindIds: [id] }
}

/** Replaces a spot's links; call it in the transaction that writes the spot. */
export async function replaceSpotKinds(
  tx: PoolClient,
  tripId: string,
  spotId: string,
  kindIds: string[],
): Promise<void> {
  await tx.query('DELETE FROM spot_kind_links WHERE spot_id = $1', [spotId])
  if (kindIds.length === 0) return
  await tx.query(
    `
    INSERT INTO spot_kind_links (trip_id, spot_id, kind_id)
    SELECT $1, $2, k FROM unnest($3::uuid[]) AS k
    `,
    [tripId, spotId, kindIds],
  )
}
