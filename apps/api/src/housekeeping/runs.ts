import type { HousekeepingJobName, JobResult } from '@tripboard/shared'
import type { Pool } from 'pg'

export type JobRunRow = {
  job: string
  lastStartedAt: Date
  lastFinishedAt: Date | null
  lastResult: JobResult | null
  lastError: string | null
}

/** Longest error message kept in `job_runs.last_error` (column CHECK). */
export const jobErrorMaxLength = 1000

/** Upserts the job's row when a run starts; result columns keep the last run's values. */
export async function recordJobStart(
  pool: Pool,
  job: HousekeepingJobName,
  at: Date,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO job_runs (job, last_started_at) VALUES ($1, $2)
    ON CONFLICT (job) DO UPDATE SET last_started_at = EXCLUDED.last_started_at
    `,
    [job, at],
  )
}

export async function recordJobEnd(
  pool: Pool,
  job: HousekeepingJobName,
  at: Date,
  result: JobResult,
  error: string | null,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO job_runs (job, last_started_at, last_finished_at, last_result, last_error)
    VALUES ($1, $2, $2, $3, $4)
    ON CONFLICT (job) DO UPDATE SET
      last_finished_at = EXCLUDED.last_finished_at,
      last_result = EXCLUDED.last_result,
      last_error = EXCLUDED.last_error
    `,
    [job, at, result, error?.slice(0, jobErrorMaxLength) ?? null],
  )
}

export async function readJobRuns(pool: Pool): Promise<JobRunRow[]> {
  const result = await pool.query<{
    job: string
    last_started_at: Date
    last_finished_at: Date | null
    last_result: JobResult | null
    last_error: string | null
  }>(
    `
    SELECT job, last_started_at, last_finished_at, last_result, last_error
    FROM job_runs ORDER BY job
    `,
  )
  return result.rows.map((row) => ({
    job: row.job,
    lastStartedAt: row.last_started_at,
    lastFinishedAt: row.last_finished_at,
    lastResult: row.last_result,
    lastError: row.last_error,
  }))
}
