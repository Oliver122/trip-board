import type { Pool } from 'pg'
import type { AdminStats } from '@tripboard/shared'
import { capacityWarning } from './capacity.js'
import { num } from './page.js'

const rangeDays = { '7d': 7, '30d': 30, '90d': 90 } as const

export async function readStats(
  pool: Pool,
  range: AdminStats['range'],
  now: Date,
): Promise<AdminStats> {
  const from =
    range === 'all'
      ? null
      : new Date(now.getTime() - rangeDays[range] * 86_400_000)
  const counts = await pool.query<{
    users_total: number
    users_new: number
    active_24h: number
    active_7d: number
    active_30d: number
    trips_total: number
    trips_new: number
    spots_total: number
    images_total: number
    events: number
    db_bytes: string
    db_capacity_bytes: string
    blob_bytes: string
    blob_capacity_bytes: string
    capacity_warn_pct: number
  }>(
    `
    SELECT
      (SELECT count(*) FROM users)::int AS users_total,
      (SELECT count(*) FROM users WHERE ($1::timestamptz IS NULL OR created_at >= $1))::int AS users_new,
      (SELECT count(*) FROM users WHERE last_seen_at >= $2::timestamptz - interval '24 hours')::int AS active_24h,
      (SELECT count(*) FROM users WHERE last_seen_at >= $2::timestamptz - interval '7 days')::int AS active_7d,
      (SELECT count(*) FROM users WHERE last_seen_at >= $2::timestamptz - interval '30 days')::int AS active_30d,
      (SELECT count(*) FROM trips)::int AS trips_total,
      (SELECT count(*) FROM trips WHERE ($1::timestamptz IS NULL OR created_at >= $1))::int AS trips_new,
      (SELECT count(*) FROM spots)::int AS spots_total,
      (SELECT count(*) FROM images)::int AS images_total,
      (SELECT count(*) FROM activity_events WHERE ($1::timestamptz IS NULL OR created_at >= $1))::int AS events,
      s.db_bytes,
      s.db_capacity_bytes,
      s.blob_bytes,
      s.blob_capacity_bytes,
      s.capacity_warn_pct
    FROM admin_storage_summary s
    `,
    [from, now],
  )
  const row = counts.rows[0]
  if (!row) throw new Error('storage summary missing')
  const dbBytes = num(row.db_bytes)
  const dbCapacityBytes = num(row.db_capacity_bytes)
  const blobBytes = num(row.blob_bytes)
  const blobCapacityBytes = num(row.blob_capacity_bytes)
  const warning = capacityWarning(
    dbBytes,
    dbCapacityBytes,
    blobBytes,
    blobCapacityBytes,
    row.capacity_warn_pct,
  )
  return {
    range,
    usersTotal: row.users_total,
    usersNew: row.users_new,
    active24h: row.active_24h,
    active7d: row.active_7d,
    active30d: row.active_30d,
    tripsTotal: row.trips_total,
    tripsNew: row.trips_new,
    spotsTotal: row.spots_total,
    imagesTotal: row.images_total,
    events: row.events,
    dbBytes,
    dbCapacityBytes,
    blobBytes,
    blobCapacityBytes,
    capacityWarnPct: row.capacity_warn_pct,
    warning: warning.warning,
    level: warning.level,
  }
}
