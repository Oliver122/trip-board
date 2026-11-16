import {
  housekeepingJobNames,
  opsRanges,
  type AdminOps,
} from '@tripboard/shared'
import type { Pool } from 'pg'
import { readJobRuns, type JobRunRow } from '../housekeeping/runs.js'
import type { HousekeepingJobs } from '../housekeeping/jobs.js'

type OpsRange = (typeof opsRanges)[number]

const iso = (value: Date | null): string | null => value?.toISOString() ?? null

/** Counter rows of the last N UTC days up to today plus one status per job (R-45-08). */
export async function readOps(
  pool: Pool,
  jobs: HousekeepingJobs,
  startedAt: Date,
  range: OpsRange,
  now: Date,
): Promise<AdminOps> {
  const dayCount = Number.parseInt(range, 10)
  const [counters, runs] = await Promise.all([
    pool.query<{
      day: string
      http_5xx: number
      http_429: number
      api_starts: number
    }>(
      `
      SELECT day::text AS day, http_5xx, http_429, api_starts
      FROM ops_counters
      WHERE day > ($1::timestamptz AT TIME ZONE 'UTC')::date - $2::int
        AND day <= ($1::timestamptz AT TIME ZONE 'UTC')::date
      ORDER BY day
      `,
      [now, dayCount],
    ),
    readJobRuns(pool),
  ])
  const byJob = new Map(runs.map((run) => [run.job, run]))
  return {
    startedAt: startedAt.toISOString(),
    days: counters.rows.map((row) => ({
      day: row.day,
      http5xx: row.http_5xx,
      http429: row.http_429,
      apiStarts: row.api_starts,
    })),
    jobs: housekeepingJobNames.map((job) => {
      const run = byJob.get(job)
      return {
        job,
        intervalMs: jobs[job].intervalMs,
        lastStartedAt: iso(run?.lastStartedAt ?? null),
        lastFinishedAt: iso(run?.lastFinishedAt ?? null),
        lastResult: run?.lastResult ?? null,
        lastError: run?.lastError ?? null,
      }
    }),
  }
}

export async function readJobRun(
  pool: Pool,
  job: string,
): Promise<JobRunRow | null> {
  const runs = await readJobRuns(pool)
  return runs.find((run) => run.job === job) ?? null
}
