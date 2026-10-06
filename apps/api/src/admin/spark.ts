import type { Pool } from 'pg'

export async function activitySparkline(
  pool: Pool,
  column: 'actor_id' | 'trip_id',
  id: string,
): Promise<number[]> {
  const result = await pool.query<{ n: number }>(
    `
    SELECT count(e.id)::int AS n
    FROM generate_series(
      ((now() AT TIME ZONE 'UTC')::date - 29),
      (now() AT TIME ZONE 'UTC')::date,
      interval '1 day'
    ) AS gs
    LEFT JOIN activity_events e
      ON e.${column} = $1
     AND (e.created_at AT TIME ZONE 'UTC')::date = gs::date
    GROUP BY gs
    ORDER BY gs
    `,
    [id],
  )
  return result.rows.map((row) => row.n)
}
