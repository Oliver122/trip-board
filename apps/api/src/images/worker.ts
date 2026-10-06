import type { Pool } from 'pg'
import type { ObjectStorage } from './storage.js'

const maxAttempts = 10
const backoffMs = 60_000
const batchSize = 50

/** Delete queued blobs. Failures stay in the queue and wait longer each time. */
export async function drainBlobDeletions(
  pool: Pool,
  storage: ObjectStorage,
  now: Date,
): Promise<number> {
  const queued = await pool.query<{
    id: string
    storage_key: string
    attempts: number
    enqueued_at: Date
  }>(
    `
    SELECT id, storage_key, attempts, enqueued_at
    FROM blob_deletions
    WHERE attempts < $1
    ORDER BY enqueued_at
    LIMIT $2
    `,
    [maxAttempts, batchSize],
  )

  let removed = 0
  for (const row of queued.rows) {
    if (row.attempts > 0) {
      const waitUntil = row.enqueued_at.getTime() + row.attempts * backoffMs
      if (now.getTime() < waitUntil) continue
    }
    try {
      await storage.delete(row.storage_key)
      await pool.query('DELETE FROM blob_deletions WHERE id = $1', [row.id])
      removed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const updated = await pool.query<{ attempts: number }>(
        `
        UPDATE blob_deletions
        SET attempts = attempts + 1, last_error = $2
        WHERE id = $1
        RETURNING attempts
        `,
        [row.id, message],
      )
      const attempts = updated.rows[0]?.attempts ?? maxAttempts
      if (attempts >= maxAttempts) {
        console.error(
          `Blob deletion gave up after ${attempts} attempts: ${row.storage_key}`,
        )
      }
    }
  }
  return removed
}
