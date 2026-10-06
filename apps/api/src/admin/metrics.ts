import {
  daySpan,
  metricsMaxSpanDays,
  type AdminMetrics,
} from '@tripboard/shared'
import type { Pool } from 'pg'
import { num } from './page.js'

export function metricsRangeError(
  from: string,
  to: string,
): 'invalid_request' | null {
  const span = daySpan(from, to)
  if (span === null || span < 0 || span > metricsMaxSpanDays)
    return 'invalid_request'
  return null
}

export async function readMetrics(
  pool: Pool,
  from: string,
  to: string,
): Promise<AdminMetrics> {
  const [days, activity, topUsers, topTrips] = await Promise.all([
    pool.query<{
      day: string
      users_total: number
      users_new: number
      users_active: number
      trips_total: number
      spots_total: number
      plan_entries_total: number
      images_total: number
      image_bytes_total: string
      db_bytes: string
      events_total: number
    }>(
      `
      SELECT day::text AS day, users_total, users_new, users_active, trips_total,
             spots_total, plan_entries_total, images_total, image_bytes_total,
             db_bytes, events_total
      FROM metrics_daily
      WHERE day >= $1::date AND day <= $2::date
      ORDER BY day
      `,
      [from, to],
    ),
    pool.query<{
      day: string
      spots: number
      plans: number
      images: number
      other: number
    }>(
      `
      SELECT gs::date::text AS day,
        count(e.id) FILTER (WHERE e.action LIKE 'spot.%')::int AS spots,
        count(e.id) FILTER (WHERE e.action LIKE 'plan.%')::int AS plans,
        count(e.id) FILTER (WHERE e.action LIKE 'image.%')::int AS images,
        count(e.id) FILTER (
          WHERE e.action IS NOT NULL
            AND e.action NOT LIKE 'spot.%'
            AND e.action NOT LIKE 'plan.%'
            AND e.action NOT LIKE 'image.%'
        )::int AS other
      FROM generate_series($1::date, $2::date, interval '1 day') AS gs
      LEFT JOIN activity_events e
        ON (e.created_at AT TIME ZONE 'UTC')::date = gs::date
      GROUP BY gs
      ORDER BY gs
      `,
      [from, to],
    ),
    pool.query<{ id: string; name: string; bytes: string }>(
      `
      SELECT u.id, COALESCE(u.display_name, u.username) AS name,
             sum(i.bytes)::bigint AS bytes
      FROM images i
      JOIN users u ON u.id = i.uploaded_by
      GROUP BY u.id
      ORDER BY sum(i.bytes) DESC, name
      LIMIT 10
      `,
    ),
    pool.query<{ id: string; name: string; events: number }>(
      `
      SELECT t.id, t.name, count(*)::int AS events
      FROM activity_events e
      JOIN trips t ON t.id = e.trip_id
      WHERE (e.created_at AT TIME ZONE 'UTC')::date BETWEEN $1::date AND $2::date
      GROUP BY t.id
      ORDER BY count(*) DESC, t.name
      LIMIT 10
      `,
      [from, to],
    ),
  ])
  return {
    days: days.rows.map((row) => ({
      day: row.day,
      usersTotal: row.users_total,
      usersNew: row.users_new,
      usersActive: row.users_active,
      tripsTotal: row.trips_total,
      spotsTotal: row.spots_total,
      planEntriesTotal: row.plan_entries_total,
      imagesTotal: row.images_total,
      imageBytesTotal: num(row.image_bytes_total),
      dbBytes: num(row.db_bytes),
      eventsTotal: row.events_total,
    })),
    activity: activity.rows,
    topUsers: topUsers.rows.map((row) => ({
      id: row.id,
      name: row.name,
      bytes: num(row.bytes),
    })),
    topTrips: topTrips.rows,
  }
}
