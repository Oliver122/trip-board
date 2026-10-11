import type { Pool } from 'pg'
import {
  decodeCursor,
  iso,
  likePattern,
  listPage,
  num,
  type SortSpec,
} from './page.js'
import { readKindLimit } from './kind-limits.js'
import { activitySparkline } from './spark.js'
import { toAction } from './users.js'

function timestampKey(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
}

const tripSorts: Record<string, SortSpec> = {
  name: { expr: 'lower(o.name)', cast: 'text' },
  createdAt: { expr: timestampKey('o.created_at'), cast: 'text' },
  members: { expr: 'o.members', cast: 'int' },
  spots: { expr: 'o.spots', cast: 'int' },
  planEntries: { expr: 'o.plan_entries', cast: 'int' },
  images: { expr: 'o.images', cast: 'int' },
  imageBytes: { expr: 'o.image_bytes', cast: 'bigint' },
  lastActivityAt: {
    expr: timestampKey("COALESCE(o.last_activity_at, 'epoch'::timestamptz)"),
    cast: 'text',
  },
}

type TripRow = {
  id: string
  name: string
  created_at: Date
  created_by: string | null
  owner_id: string | null
  owner_name: string | null
  members: number
  spots: number
  plan_entries: number
  images: number
  image_bytes: string | number
  last_activity_at: Date | null
}

const tripFrom = `
  FROM admin_trip_overview o
  LEFT JOIN users owner ON owner.id = o.owner_id
`

const tripSelect = `
  o.id, o.name, o.created_at, o.created_by, o.owner_id,
  COALESCE(owner.display_name, owner.username) AS owner_name,
  o.members, o.spots, o.plan_entries, o.images, o.image_bytes, o.last_activity_at
`

export function toAdminTrip(row: TripRow) {
  return {
    id: row.id,
    name: row.name,
    createdAt: iso(row.created_at)!,
    createdBy: row.created_by,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    members: num(row.members),
    spots: num(row.spots),
    planEntries: num(row.plan_entries),
    images: num(row.images),
    imageBytes: num(row.image_bytes),
    lastActivityAt: iso(row.last_activity_at),
  }
}

export async function listTrips(
  pool: Pool,
  query: { q?: string; sort?: string; dir?: 'asc' | 'desc'; cursor?: string },
) {
  const cursor = decodeCursor(query.cursor)
  if (cursor === 'invalid') return { error: 'invalid_cursor' as const }
  const sort = tripSorts[query.sort ?? 'name'] ?? tripSorts.name!
  const dir = query.dir === 'desc' ? 'DESC' : 'ASC'
  const params: unknown[] = []
  const where = ['TRUE']
  if (query.q) {
    params.push(likePattern(query.q))
    where.push(`o.name ILIKE $${params.length} ESCAPE '\\'`)
  }
  const page = await listPage(pool, {
    select: `${tripSelect}, ${sort.expr} AS sort_key`,
    from: tripFrom,
    where: where.join(' AND '),
    params,
    sort,
    dir,
    idExpr: 'o.id',
    idCast: 'uuid',
    cursor,
    key: (row) => String(row.sort_key),
    id: (row) => String(row.id),
    map: (row) => toAdminTrip(row as TripRow),
  })
  return { trips: page.rows, nextCursor: page.nextCursor }
}

export async function getAdminTrip(pool: Pool, id: string) {
  const found = await pool.query<TripRow>(
    `SELECT ${tripSelect} ${tripFrom} WHERE o.id = $1`,
    [id],
  )
  const row = found.rows[0]
  if (!row) return null
  const [members, actions, sparkline, kindLimit] = await Promise.all([
    pool.query<{
      id: string
      username: string
      display_name: string | null
      role: 'owner' | 'planner' | 'visitor'
    }>(
      `
      SELECT u.id, u.username, u.display_name, m.role
      FROM trip_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.trip_id = $1
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'planner' THEN 1 ELSE 2 END, u.username
      `,
      [id],
    ),
    pool.query(
      `
      SELECT e.id, e.action, e.metadata, e.created_at, e.actor_id, e.trip_id,
             COALESCE(u.display_name, u.username) AS actor_name,
             t.name AS trip_name
      FROM activity_events e
      LEFT JOIN users u ON u.id = e.actor_id
      LEFT JOIN trips t ON t.id = e.trip_id
      WHERE e.trip_id = $1
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 20
      `,
      [id],
    ),
    activitySparkline(pool, 'trip_id', id),
    readKindLimit(pool, id),
  ])
  return {
    trip: toAdminTrip(row),
    members: members.rows.map((member) => ({
      id: member.id,
      username: member.username,
      displayName: member.display_name,
      role: member.role,
    })),
    actions: actions.rows.map(toAction),
    sparkline,
    kindLimit: kindLimit!,
  }
}
