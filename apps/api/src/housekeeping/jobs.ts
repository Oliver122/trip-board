import type {
  HousekeepingJobName,
  JobResult,
  JobRunResponse,
} from '@tripboard/shared'
import type { Pool } from 'pg'
import { nextMetricsRun, snapshotYesterday } from '../admin/metrics-job.js'
import { reportCapacityWarnings } from '../admin/webhook.js'
import { drainBlobDeletions } from '../images/worker.js'
import type { ObjectStorage } from '../images/storage.js'
import { recordJobEnd, recordJobStart } from './runs.js'

export async function deleteExpiredSessions(
  pool: Pool,
  now: Date,
): Promise<number> {
  const result = await pool.query(
    'DELETE FROM sessions WHERE expires_at < $1',
    [now],
  )
  return result.rowCount ?? 0
}

/** Invites that expired, or were revoked, more than 90 days ago. */
export async function deleteOldInvites(pool: Pool, now: Date): Promise<number> {
  const result = await pool.query(
    `
    DELETE FROM trip_invites
    WHERE expires_at < $1::timestamptz - interval '90 days'
       OR revoked_at < $1::timestamptz - interval '90 days'
    `,
    [now],
  )
  return result.rowCount ?? 0
}

export async function deleteStaleGeocode(
  pool: Pool,
  now: Date,
): Promise<number> {
  const result = await pool.query(
    `
    DELETE FROM geocode_cache
    WHERE created_at < $1::timestamptz - interval '30 days'
    `,
    [now],
  )
  return result.rowCount ?? 0
}

export async function deleteStaleCommons(
  pool: Pool,
  now: Date,
): Promise<number> {
  const result = await pool.query(
    `
    DELETE FROM commons_cache
    WHERE created_at < $1::timestamptz - interval '7 days'
    `,
    [now],
  )
  return result.rowCount ?? 0
}

export async function deleteOldActivity(
  pool: Pool,
  now: Date,
): Promise<number> {
  const result = await pool.query(
    `
    DELETE FROM activity_events
    WHERE created_at < $1::timestamptz - interval '180 days'
    `,
    [now],
  )
  return result.rowCount ?? 0
}

const hourMs = 60 * 60 * 1000
const dayMs = 24 * hourMs

type HousekeepingDeps = {
  pool: Pool
  storage: ObjectStorage
  now: () => Date
  webhook?: { url: string; fetchImpl?: typeof fetch }
}

type HousekeepingJob = {
  /** How often the timer runs it; `metrics` runs daily at 00:05 UTC. */
  intervalMs: number
  task: () => Promise<unknown>
}

export type HousekeepingJobs = Record<HousekeepingJobName, HousekeepingJob>

/**
 * The seven housekeeping jobs. The timers and `POST /admin/ops/jobs/:job/run`
 * both run these functions (R-45-10).
 */
export function housekeepingJobs(deps: HousekeepingDeps): HousekeepingJobs {
  const { pool, storage, now, webhook } = deps
  return {
    sessions: {
      intervalMs: hourMs,
      task: () => deleteExpiredSessions(pool, now()),
    },
    invites: { intervalMs: dayMs, task: () => deleteOldInvites(pool, now()) },
    geocode: { intervalMs: dayMs, task: () => deleteStaleGeocode(pool, now()) },
    commons: { intervalMs: dayMs, task: () => deleteStaleCommons(pool, now()) },
    activity: { intervalMs: dayMs, task: () => deleteOldActivity(pool, now()) },
    blobs: {
      intervalMs: 60_000,
      task: () => drainBlobDeletions(pool, storage, now()),
    },
    metrics: {
      intervalMs: dayMs,
      task: async () => {
        await snapshotYesterday(pool, now())
        if (webhook?.url) {
          await reportCapacityWarnings(pool, {
            url: webhook.url,
            now: now(),
            fetchImpl: webhook.fetchImpl,
          })
        }
      },
    },
  }
}

function logError(fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: 'error', ...fields }))
}

/**
 * Runs one job and records it in `job_runs` (R-45-07). Never rejects: a failing
 * job logs its error line and answers `error`; a failing upsert only logs.
 */
export async function runJob(
  pool: Pool,
  job: HousekeepingJobName,
  task: () => Promise<unknown>,
  now: () => Date = () => new Date(),
): Promise<JobRunResponse> {
  await recordJobStart(pool, job, now()).catch((error: unknown) => {
    logError({ job, msg: 'job_runs start failed', err: messageOf(error) })
  })
  let result: JobResult = 'ok'
  let message: string | undefined
  try {
    await task()
  } catch (error) {
    result = 'error'
    message = messageOf(error)
    logError({ job, msg: message })
  }
  await recordJobEnd(pool, job, now(), result, message ?? null).catch(
    (error: unknown) => {
      logError({ job, msg: 'job_runs end failed', err: messageOf(error) })
    },
  )
  return message === undefined
    ? { job, result }
    : { job, result, error: message }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function startHousekeeping(
  pool: Pool,
  storage: ObjectStorage,
  now: () => Date = () => new Date(),
  webhook?: { url: string; fetchImpl?: typeof fetch },
): () => void {
  const jobs = housekeepingJobs({ pool, storage, now, webhook })
  const run = (job: HousekeepingJobName) => {
    void runJob(pool, job, jobs[job].task, now)
  }
  const timers = (
    ['sessions', 'invites', 'geocode', 'commons', 'activity', 'blobs'] as const
  ).map((job) => setInterval(() => run(job), jobs[job].intervalMs))
  for (const timer of timers) timer.unref()
  let metricsTimer: NodeJS.Timeout | undefined
  const armMetrics = () => {
    const delay = Math.max(0, nextMetricsRun(now()).getTime() - now().getTime())
    metricsTimer = setTimeout(() => {
      run('metrics')
      armMetrics()
    }, delay)
    metricsTimer.unref()
  }
  armMetrics()
  return () => {
    for (const timer of timers) clearInterval(timer)
    if (metricsTimer) clearTimeout(metricsTimer)
  }
}
