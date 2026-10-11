import {
  presetKind,
  starterPresets,
  tripSchema,
  type BBox,
  type PatchTripBody,
  type Trip,
} from '@tripboard/shared'
import type { Pool, PoolClient } from 'pg'
import { activity } from '../activity/record.js'
import { latestEditor, stampAgrees, type Editor } from '../live/conflict.js'
import { withTransaction } from '../db/transaction.js'
import { requireTripRole } from './roles.js'

type Queryable = Pool | PoolClient

type TripRow = {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
  timezone: string
  updated_at: Date
  bbox_min_lng: number
  bbox_min_lat: number
  bbox_max_lng: number
  bbox_max_lat: number
  role: string
  created_by_name: string | null
  members: unknown
  unread_comments: number
}

const tripSelect = `
SELECT
  t.id,
  t.name,
  t.start_date::text AS start_date,
  t.end_date::text AS end_date,
  t.timezone,
  t.updated_at,
  t.bbox_min_lng,
  t.bbox_min_lat,
  t.bbox_max_lng,
  t.bbox_max_lat,
  m.role,
  COALESCE(creator.display_name, creator.username) AS created_by_name,
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', u.id,
        'name', COALESCE(u.display_name, u.username),
        'avatarUrl', u.avatar_url
      )
      ORDER BY
        CASE tm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'planner' THEN 2 ELSE 3 END,
        tm.joined_at
    )
    FROM trip_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.trip_id = t.id
  ), '[]'::json) AS members,
  (
    SELECT count(*)::int
    FROM spot_comments c
    LEFT JOIN spot_comment_reads r ON r.user_id = $1 AND r.spot_id = c.spot_id
    WHERE c.trip_id = t.id
      AND c.author_id IS DISTINCT FROM $1
      AND c.created_at > m.joined_at
      AND (r.last_read_at IS NULL OR c.created_at > r.last_read_at)
  ) AS unread_comments
FROM trips t
JOIN trip_members m ON m.trip_id = t.id AND m.user_id = $1
LEFT JOIN users creator ON creator.id = t.created_by
`

export type TripFailure =
  | { ok: false; status: 400; fields: Record<string, string> }
  | { ok: false; status: 403 | 404 }
  | {
      ok: false
      status: 409
      current: Trip
      updatedBy: Editor | null
    }

export async function listTrips(
  db: Queryable,
  userId: string,
): Promise<Trip[]> {
  const result = await db.query<TripRow>(
    `${tripSelect} ORDER BY t.created_at DESC, t.id`,
    [userId],
  )
  return result.rows.map(rowToTrip)
}

export async function getTrip(
  db: Queryable,
  tripId: string,
  userId: string,
): Promise<Trip | null> {
  const result = await db.query<TripRow>(`${tripSelect} WHERE t.id = $2`, [
    userId,
    tripId,
  ])
  const row = result.rows[0]
  return row ? rowToTrip(row) : null
}

export async function createTrip(
  pool: Pool,
  userId: string,
  input: {
    name: string
    timezone: string
    startDate?: string | null
    endDate?: string | null
    bbox: BBox
  },
): Promise<Trip> {
  const name = input.name.trim()
  return withTransaction(pool, async (tx) => {
    const inserted = await tx.query<{ id: string }>(
      `
      INSERT INTO trips (
        name, created_by, timezone, start_date, end_date,
        bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
      `,
      [
        name,
        userId,
        input.timezone,
        input.startDate ?? null,
        input.endDate ?? null,
        input.bbox.minLng,
        input.bbox.minLat,
        input.bbox.maxLng,
        input.bbox.maxLat,
      ],
    )
    const id = inserted.rows[0]?.id
    if (!id) throw new Error('trip insert failed')
    await tx.query(
      `
      INSERT INTO trip_members (trip_id, user_id, role)
      VALUES ($1, $2, 'owner')
      `,
      [id, userId],
    )
    for (const [order, preset] of starterPresets.entries()) {
      const kind = presetKind(preset)
      await tx.query(
        `
        INSERT INTO spot_kinds (trip_id, preset, color, symbol, sort_order)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [id, kind.preset, kind.color, kind.symbol, order],
      )
    }
    await activity.record(tx, {
      actor: userId,
      trip: id,
      action: 'trip.create',
      entityId: id,
      metadata: { trip: name },
    })
    const trip = await getTrip(tx, id, userId)
    if (!trip) throw new Error('trip missing after insert')
    return trip
  })
}

export async function updateTrip(
  pool: Pool,
  userId: string,
  tripId: string,
  patch: PatchTripBody,
  expectedUpdatedAt: string | null = null,
): Promise<{ ok: true; trip: Trip } | TripFailure> {
  return withTransaction(pool, async (tx) => {
    const access = await requireTripRole(tx, tripId, userId, 'planner')
    if (!access.ok) return { ok: false, status: access.status }
    const current = await getTrip(tx, tripId, userId)
    if (!current) return { ok: false, status: 404 }
    const disagreed = await disagree(tx, tripId, userId, expectedUpdatedAt)
    if (disagreed) return disagreed
    const name = patch.name !== undefined ? patch.name.trim() : current.name
    const startDate =
      patch.startDate !== undefined ? patch.startDate : current.startDate
    const endDate =
      patch.endDate !== undefined ? patch.endDate : current.endDate
    const bbox = patch.region?.bbox ?? current.region.bbox
    if (startDate && endDate && endDate < startDate) {
      return { ok: false, status: 400, fields: { endDate: 'before_start' } }
    }
    await tx.query(
      `
      UPDATE trips
      SET name = $2,
          start_date = $3,
          end_date = $4,
          bbox_min_lng = $5,
          bbox_min_lat = $6,
          bbox_max_lng = $7,
          bbox_max_lat = $8,
          updated_at = now()
      WHERE id = $1
      `,
      [
        tripId,
        name,
        startDate,
        endDate,
        bbox.minLng,
        bbox.minLat,
        bbox.maxLng,
        bbox.maxLat,
      ],
    )
    await activity.record(tx, {
      actor: userId,
      trip: tripId,
      action: 'trip.update',
      entityId: tripId,
      metadata: { trip: name },
    })
    const trip = await getTrip(tx, tripId, userId)
    if (!trip) throw new Error('trip missing after update')
    return { ok: true, trip }
  })
}

export async function deleteTrip(
  pool: Pool,
  userId: string,
  tripId: string,
  expectedUpdatedAt: string | null = null,
): Promise<{ ok: true } | TripFailure> {
  return withTransaction(pool, async (tx) => {
    const access = await requireTripRole(tx, tripId, userId, 'owner')
    if (!access.ok) return access
    const current = await getTrip(tx, tripId, userId)
    if (!current) return { ok: false, status: 404 }
    const disagreed = await disagree(tx, tripId, userId, expectedUpdatedAt)
    if (disagreed) return disagreed
    await activity.record(tx, {
      actor: userId,
      trip: tripId,
      action: 'trip.delete',
      entityId: tripId,
      metadata: { trip: current.name },
    })
    await tx.query('DELETE FROM trips WHERE id = $1', [tripId])
    return { ok: true }
  })
}

async function disagree(
  tx: PoolClient,
  tripId: string,
  userId: string,
  expected: string | null,
): Promise<TripFailure | null> {
  const stamp = await stampAgrees(tx, 'trips', tripId, expected)
  if (stamp === 'ok') return null
  if (stamp === 'missing') return { ok: false, status: 404 }
  const current = await getTrip(tx, tripId, userId)
  if (!current) return { ok: false, status: 404 }
  return {
    ok: false,
    status: 409,
    current,
    updatedBy: await latestEditor(tx, tripId),
  }
}

function rowToTrip(row: TripRow): Trip {
  const members =
    typeof row.members === 'string' ? JSON.parse(row.members) : row.members
  return tripSchema.parse({
    id: row.id,
    name: row.name,
    role: row.role,
    memberCount: Array.isArray(members) ? members.length : 0,
    createdByName: row.created_by_name,
    startDate: row.start_date,
    endDate: row.end_date,
    timezone: row.timezone,
    updatedAt: row.updated_at.toISOString(),
    region: {
      bbox: {
        minLng: row.bbox_min_lng,
        minLat: row.bbox_min_lat,
        maxLng: row.bbox_max_lng,
        maxLat: row.bbox_max_lat,
      },
    },
    members,
    unreadComments: row.unread_comments,
  })
}
