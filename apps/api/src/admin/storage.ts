import type { AdminStorage } from '@tripboard/shared'
import type { Pool } from 'pg'
import { fullInDays } from './capacity.js'
import { num } from './page.js'

export async function readStorage(pool: Pool): Promise<AdminStorage> {
  const [summary, past, tables, users, trips, blob] = await Promise.all([
    pool.query<{
      db_bytes: string
      db_capacity_bytes: string
      blob_bytes: string
      blob_capacity_bytes: string
      capacity_warn_pct: number
    }>(
      `
      SELECT db_bytes, db_capacity_bytes, blob_bytes, blob_capacity_bytes, capacity_warn_pct
      FROM admin_storage_summary
      `,
    ),
    pool.query<{ db_bytes: string; image_bytes_total: string }>(
      `
      SELECT db_bytes, image_bytes_total
      FROM metrics_daily
      WHERE day = (now() AT TIME ZONE 'UTC')::date - 30
      `,
    ),
    pool.query<{
      table_name: string
      table_bytes: string
      index_bytes: string
      total_bytes: string
      estimated_rows: string
    }>(
      `
      SELECT table_name, table_bytes, index_bytes, total_bytes, estimated_rows
      FROM admin_table_sizes
      ORDER BY total_bytes DESC, table_name
      `,
    ),
    pool.query<{ id: string; name: string; bytes: string }>(
      `
      SELECT u.id, COALESCE(u.display_name, u.username) AS name, sum(i.bytes)::bigint AS bytes
      FROM images i
      JOIN users u ON u.id = i.uploaded_by
      GROUP BY u.id
      ORDER BY sum(i.bytes) DESC, name
      LIMIT 10
      `,
    ),
    pool.query<{ id: string; name: string; bytes: string }>(
      `
      SELECT id, name, image_bytes AS bytes
      FROM admin_trip_overview
      WHERE image_bytes > 0
      ORDER BY image_bytes DESC, name
      LIMIT 10
      `,
    ),
    pool.query<{ bytes: string }>(
      'SELECT COALESCE(sum(bytes), 0)::bigint AS bytes FROM images',
    ),
  ])
  const row = summary.rows[0]
  if (!row) throw new Error('storage summary missing')
  const dbBytes = num(row.db_bytes)
  const blobBytes = num(blob.rows[0]?.bytes)
  const dbCapacityBytes = num(row.db_capacity_bytes)
  const blobCapacityBytes = num(row.blob_capacity_bytes)
  const pastRow = past.rows[0]
  const pastDb = pastRow ? num(pastRow.db_bytes) : null
  const pastBlob = pastRow ? num(pastRow.image_bytes_total) : null
  return {
    dbBytes,
    dbCapacityBytes,
    blobBytes,
    blobCapacityBytes,
    capacityWarnPct: row.capacity_warn_pct,
    dbGrowthBytes: pastDb === null ? null : dbBytes - pastDb,
    blobGrowthBytes: pastBlob === null ? null : blobBytes - pastBlob,
    dbFullInDays: fullInDays(dbBytes, dbCapacityBytes, pastDb),
    blobFullInDays: fullInDays(blobBytes, blobCapacityBytes, pastBlob),
    tables: tables.rows.map((table) => ({
      name: table.table_name,
      tableBytes: num(table.table_bytes),
      indexBytes: num(table.index_bytes),
      totalBytes: num(table.total_bytes),
      estimatedRows: num(table.estimated_rows),
    })),
    biggestUsers: users.rows.map((user) => ({
      id: user.id,
      name: user.name,
      bytes: num(user.bytes),
    })),
    biggestTrips: trips.rows.map((trip) => ({
      id: trip.id,
      name: trip.name,
      bytes: num(trip.bytes),
    })),
  }
}
