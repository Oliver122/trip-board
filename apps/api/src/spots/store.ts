import {
  expandTripBBox,
  spotSchema,
  spotSearchPattern,
  type BBox,
  type CreateSpotBody,
  type PatchSpotBody,
  type Spot,
  type SpotCategory,
  type SpotListFilters,
  type SpotSort,
} from '@tripboard/shared'
import type { Pool, PoolClient } from 'pg'
import { activity } from '../activity/record.js'
import { withTransaction } from '../db/transaction.js'
import { isCheckViolation } from '../http/validate.js'
import { requireTripRole } from '../trips/roles.js'

type Queryable = Pool | PoolClient

type SpotRow = {
  id: string
  trip_id: string
  title: string
  address: string | null
  lat: number
  lng: number
  base_category: SpotCategory
  display_category: Spot['displayCategory']
  plan_count: number
  first_scheduled_at: string | null
  info: string | null
  link: string | null
  created_at: Date
  updated_at: Date
  creator_id: string | null
  creator_name: string | null
  creator_avatar: string | null
}

const spotSelect = `
SELECT
  s.id,
  s.trip_id,
  s.title,
  s.address,
  s.lat,
  s.lng,
  s.base_category,
  s.display_category,
  s.plan_count,
  to_char(s.first_scheduled_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS first_scheduled_at,
  s.info,
  s.link,
  s.created_at,
  s.updated_at,
  u.id AS creator_id,
  COALESCE(u.display_name, u.username) AS creator_name,
  u.avatar_url AS creator_avatar
FROM spots_view s
LEFT JOIN users u ON u.id = s.created_by
`

export type SpotFailure =
  | { ok: false; status: 400; fields: Record<string, string> }
  | { ok: false; status: 403 | 404 }

const sortOrderSql: Record<SpotSort, string> = {
  scheduled: `(s.first_scheduled_at IS NULL), s.first_scheduled_at, array_position(ARRAY['must_go','maybe','home']::display_category[], s.display_category), lower(s.title), s.id`,
  datetime: `s.first_scheduled_at NULLS LAST, lower(s.title), s.id`,
  category: `array_position(ARRAY['must_go','maybe','planned','home']::display_category[], s.display_category), lower(s.title), s.id`,
  az: `lower(s.title), s.id`,
  newest: `s.created_at DESC, s.id DESC`,
}

export async function listSpots(
  db: Queryable,
  tripId: string,
  userId: string,
  filters: SpotListFilters,
): Promise<
  { ok: true; spots: Spot[]; total: number } | { ok: false; status: 403 | 404 }
> {
  const access = await requireTripRole(db, tripId, userId, 'visitor')
  if (!access.ok) return access
  const totalResult = await db.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM spots WHERE trip_id = $1',
    [tripId],
  )
  const values: unknown[] = [tripId]
  const where = ['s.trip_id = $1']
  const pattern = spotSearchPattern(filters.q)
  if (pattern) {
    values.push(pattern)
    where.push(
      `lower(s.title || ' ' || coalesce(s.address, '') || ' ' || coalesce(s.info, '')) LIKE lower($${values.length}) ESCAPE '!'`,
    )
  }
  if (filters.cat.length > 0) {
    values.push(filters.cat)
    where.push(`s.display_category::text = ANY($${values.length}::text[])`)
  }
  if (filters.status === 'scheduled') where.push('s.plan_count > 0')
  if (filters.status === 'unscheduled') where.push('s.plan_count = 0')
  if (filters.by) {
    values.push(filters.by)
    where.push(`s.created_by = $${values.length}`)
  }
  if (filters.entry) {
    values.push(filters.entry)
    where.push(
      `EXISTS (SELECT 1 FROM plan_entry_spots p WHERE p.spot_id = s.id AND p.plan_entry_id = $${values.length})`,
    )
  }
  const result = await db.query<SpotRow>(
    `${spotSelect} WHERE ${where.join(' AND ')} ORDER BY ${sortOrderSql[filters.sort]}`,
    values,
  )
  return {
    ok: true,
    spots: result.rows.map(rowToSpot),
    total: Number(totalResult.rows[0]?.total ?? 0),
  }
}

export async function getSpot(
  db: Queryable,
  spotId: string,
  userId: string,
): Promise<Spot | null> {
  const result = await db.query<SpotRow>(`${spotSelect} WHERE s.id = $1`, [
    spotId,
  ])
  const row = result.rows[0]
  if (!row) return null
  const access = await requireTripRole(db, row.trip_id, userId, 'visitor')
  if (!access.ok) return null
  return rowToSpot(row)
}

export async function createSpot(
  pool: Pool,
  userId: string,
  tripId: string,
  input: CreateSpotBody,
): Promise<{ ok: true; spot: Spot } | SpotFailure> {
  try {
    return await withTransaction(pool, async (tx) => {
      const access = await requireTripRole(tx, tripId, userId, 'planner')
      if (!access.ok) return access
      const title = input.title.trim()
      const inserted = await tx.query<{ id: string }>(
        `
        INSERT INTO spots (
          trip_id, title, address, lat, lng, base_category, info, link, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6::spot_category, $7, $8, $9)
        RETURNING id
        `,
        [
          tripId,
          title,
          blankToNull(input.address),
          input.lat,
          input.lng,
          input.baseCategory,
          blankToNull(input.info),
          blankToNull(input.link),
          userId,
        ],
      )
      const id = inserted.rows[0]?.id
      if (!id) throw new Error('spot insert failed')
      await expandTrip(tx, tripId, input.lng, input.lat)
      await activity.record(tx, {
        actor: userId,
        trip: tripId,
        action: 'spot.create',
        entityId: id,
        metadata: { spot: title },
      })
      const spot = await getSpot(tx, id, userId)
      if (!spot) throw new Error('spot missing after insert')
      return { ok: true, spot }
    })
  } catch (error) {
    if (isCheckViolation(error)) {
      return { ok: false, status: 400, fields: { body: 'invalid' } }
    }
    throw error
  }
}

export async function updateSpot(
  pool: Pool,
  userId: string,
  spotId: string,
  patch: PatchSpotBody,
): Promise<{ ok: true; spot: Spot } | SpotFailure> {
  try {
    return await withTransaction(pool, async (tx) => {
      const current = await loadSpotForWrite(tx, spotId, userId)
      if (!current.ok) return current
      const title =
        patch.title !== undefined ? patch.title.trim() : current.spot.title
      const lat = patch.lat !== undefined ? patch.lat : current.spot.lat
      const lng = patch.lng !== undefined ? patch.lng : current.spot.lng
      const baseCategory =
        patch.baseCategory !== undefined
          ? patch.baseCategory
          : current.spot.baseCategory
      const address =
        patch.address !== undefined
          ? blankToNull(patch.address)
          : current.spot.address
      const info =
        patch.info !== undefined ? blankToNull(patch.info) : current.spot.info
      const link =
        patch.link !== undefined ? blankToNull(patch.link) : current.spot.link
      await tx.query(
        `
        UPDATE spots
        SET title = $2,
            address = $3,
            lat = $4,
            lng = $5,
            base_category = $6::spot_category,
            info = $7,
            link = $8,
            updated_at = now()
        WHERE id = $1
        `,
        [spotId, title, address, lat, lng, baseCategory, info, link],
      )
      await expandTrip(tx, current.spot.tripId, lng, lat)
      await activity.record(tx, {
        actor: userId,
        trip: current.spot.tripId,
        action: 'spot.update',
        entityId: spotId,
        metadata: { spot: title },
      })
      const spot = await getSpot(tx, spotId, userId)
      if (!spot) throw new Error('spot missing after update')
      return { ok: true, spot }
    })
  } catch (error) {
    if (isCheckViolation(error)) {
      return { ok: false, status: 400, fields: { body: 'invalid' } }
    }
    throw error
  }
}

export async function deleteSpot(
  pool: Pool,
  userId: string,
  spotId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
  return withTransaction(pool, async (tx) => {
    const current = await loadSpotForWrite(tx, spotId, userId)
    if (!current.ok) return current
    await activity.record(tx, {
      actor: userId,
      trip: current.spot.tripId,
      action: 'spot.delete',
      entityId: spotId,
      metadata: { spot: current.spot.title },
    })
    await tx.query('DELETE FROM spots WHERE id = $1', [spotId])
    return { ok: true }
  })
}

async function loadSpotForWrite(
  db: Queryable,
  spotId: string,
  userId: string,
): Promise<{ ok: true; spot: Spot } | { ok: false; status: 403 | 404 }> {
  const result = await db.query<{ trip_id: string }>(
    'SELECT trip_id FROM spots WHERE id = $1',
    [spotId],
  )
  const tripId = result.rows[0]?.trip_id
  if (!tripId) return { ok: false, status: 404 }
  const access = await requireTripRole(db, tripId, userId, 'planner')
  if (!access.ok) return access
  const spot = await getSpot(db, spotId, userId)
  if (!spot) return { ok: false, status: 404 }
  return { ok: true, spot }
}

async function expandTrip(
  tx: PoolClient,
  tripId: string,
  lng: number,
  lat: number,
): Promise<void> {
  const result = await tx.query<{
    bbox_min_lng: number
    bbox_min_lat: number
    bbox_max_lng: number
    bbox_max_lat: number
  }>(
    `
    SELECT bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat
    FROM trips
    WHERE id = $1
    FOR UPDATE
    `,
    [tripId],
  )
  const row = result.rows[0]
  if (!row) throw new Error('trip missing during spot save')
  const current: BBox = {
    minLng: row.bbox_min_lng,
    minLat: row.bbox_min_lat,
    maxLng: row.bbox_max_lng,
    maxLat: row.bbox_max_lat,
  }
  const next = expandTripBBox(current, lng, lat)
  if (next === current) return
  await tx.query(
    `
    UPDATE trips
    SET bbox_min_lng = $2,
        bbox_min_lat = $3,
        bbox_max_lng = $4,
        bbox_max_lat = $5,
        updated_at = now()
    WHERE id = $1
    `,
    [tripId, next.minLng, next.minLat, next.maxLng, next.maxLat],
  )
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function rowToSpot(row: SpotRow): Spot {
  return spotSchema.parse({
    id: row.id,
    tripId: row.trip_id,
    title: row.title,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    baseCategory: row.base_category,
    displayCategory: row.display_category,
    planCount: Number(row.plan_count),
    firstScheduledAt: row.first_scheduled_at,
    info: row.info,
    link: row.link,
    createdBy: row.creator_id
      ? {
          id: row.creator_id,
          name: row.creator_name ?? '',
          avatar: row.creator_avatar,
        }
      : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  })
}
