import type { Pool } from 'pg'
import { nextMetricsRun, snapshotYesterday } from '../admin/metrics-job.js'
import { reportCapacityWarnings } from '../admin/webhook.js'
import { drainBlobDeletions } from '../images/worker.js'
import type { ObjectStorage } from '../images/storage.js'

export const inviteRetentionDays = 90
export const geocodeRetentionDays = 30
export const activityRetentionDays = 180

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

export function startHousekeeping(
  pool: Pool,
  storage: ObjectStorage,
  now: () => Date = () => new Date(),
  webhook?: { url: string; fetchImpl?: typeof fetch },
): () => void {
  const run = (job: string, task: () => Promise<unknown>) => {
    void task().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error(JSON.stringify({ level: 'error', job, msg: message }))
    })
  }
  const timers = [
    setInterval(
      () => run('sessions', () => deleteExpiredSessions(pool, now())),
      hourMs,
    ),
    setInterval(
      () => run('invites', () => deleteOldInvites(pool, now())),
      dayMs,
    ),
    setInterval(
      () => run('geocode', () => deleteStaleGeocode(pool, now())),
      dayMs,
    ),
    setInterval(
      () => run('activity', () => deleteOldActivity(pool, now())),
      dayMs,
    ),
    setInterval(
      () => run('blobs', () => drainBlobDeletions(pool, storage, now())),
      60_000,
    ),
  ]
  for (const timer of timers) timer.unref()
  let metricsTimer: NodeJS.Timeout | undefined
  const armMetrics = () => {
    const delay = Math.max(0, nextMetricsRun(now()).getTime() - now().getTime())
    metricsTimer = setTimeout(() => {
      run('metrics', async () => {
        await snapshotYesterday(pool, now())
        if (webhook?.url) {
          await reportCapacityWarnings(pool, {
            url: webhook.url,
            now: now(),
            fetchImpl: webhook.fetchImpl,
          })
        }
      })
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
