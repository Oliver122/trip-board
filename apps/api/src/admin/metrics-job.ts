import type { Pool, PoolClient } from 'pg'

export function yesterdayUtc(now: Date): string {
  const day = new Date(now.getTime())
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}

/** Next 00:05 UTC strictly after `now`. */
export function nextMetricsRun(now: Date): Date {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      5,
      0,
      0,
    ),
  )
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1)
  return next
}

async function withUtc(
  pool: Pool,
  task: (client: PoolClient) => Promise<void>,
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL TIME ZONE 'UTC'")
    await task(client)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function snapshotDay(pool: Pool, day: string): Promise<void> {
  await withUtc(pool, async (client) => {
    await client.query('SELECT snapshot_daily_metrics($1::date)', [day])
  })
}

export async function snapshotYesterday(pool: Pool, now: Date): Promise<void> {
  await snapshotDay(pool, yesterdayUtc(now))
}

/** Fills days that have no metrics row, from the earliest user or event through yesterday. */
export async function backfillMetrics(pool: Pool, now: Date): Promise<number> {
  let created = 0
  const today = now.toISOString().slice(0, 10)
  await withUtc(pool, async (client) => {
    const result = await client.query(
      `
      WITH mins AS (
        SELECT
          (SELECT min(created_at)::date FROM activity_events) AS events_day,
          (SELECT min(created_at)::date FROM users) AS users_day
      ),
      bounds AS (
        SELECT
          CASE
            WHEN events_day IS NULL THEN users_day
            WHEN users_day IS NULL THEN events_day
            ELSE LEAST(events_day, users_day)
          END AS start_day,
          ($1::date - 1) AS end_day
        FROM mins
      ),
      missing AS (
        SELECT day::date AS day
        FROM bounds,
             generate_series(start_day, end_day, interval '1 day') AS day
        WHERE start_day IS NOT NULL
          AND end_day >= start_day
          AND NOT EXISTS (
            SELECT 1 FROM metrics_daily m WHERE m.day = day::date
          )
      )
      SELECT snapshot_daily_metrics(day) FROM missing
      `,
      [today],
    )
    created = result.rowCount ?? 0
  })
  return created
}
