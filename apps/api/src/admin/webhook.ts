import type { Pool } from 'pg'
import { capacityWarning } from './capacity.js'

type WebhookOptions = {
  url: string
  fetchImpl?: typeof fetch
  now: Date
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

async function postDiscord(
  url: string,
  content: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok) throw new Error(`webhook ${response.status}`)
}

async function alreadySent(
  pool: Pool,
  kind: string,
  day: string,
): Promise<boolean> {
  const found = await pool.query<{ sent_on: string }>(
    'SELECT sent_on::text AS sent_on FROM webhook_notices WHERE kind = $1',
    [kind],
  )
  return found.rows[0]?.sent_on === day
}

async function markSent(pool: Pool, kind: string, day: string): Promise<void> {
  await pool.query(
    `
    INSERT INTO webhook_notices (kind, sent_on)
    VALUES ($1, $2::date)
    ON CONFLICT (kind) DO UPDATE SET sent_on = EXCLUDED.sent_on
    `,
    [kind, day],
  )
}

/** Posts when database or image storage crosses the warning line, once per resource per UTC day. */
export async function reportCapacityWarnings(
  pool: Pool,
  options: WebhookOptions,
): Promise<number> {
  if (!options.url) return 0
  const fetchImpl = options.fetchImpl ?? fetch
  const summary = await pool.query<{
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
  )
  const row = summary.rows[0]
  if (!row) return 0
  const dbBytes = Number(row.db_bytes)
  const blobBytes = Number(row.blob_bytes)
  const warning = capacityWarning(
    dbBytes,
    Number(row.db_capacity_bytes),
    blobBytes,
    Number(row.blob_capacity_bytes),
    row.capacity_warn_pct,
  )
  if (!warning.warning || !warning.level) return 0
  const kind = `capacity:${warning.warning}`
  const day = utcDay(options.now)
  if (await alreadySent(pool, kind, day)) return 0
  const label = warning.warning === 'db' ? 'Database' : 'Image storage'
  const pct =
    warning.warning === 'db'
      ? Math.round((100 * dbBytes) / Number(row.db_capacity_bytes))
      : Math.round((100 * blobBytes) / Number(row.blob_capacity_bytes))
  await postDiscord(
    options.url,
    `${label} is at ${pct}% (${warning.level}).`,
    fetchImpl,
  )
  await markSent(pool, kind, day)
  return 1
}

export async function notifyQuotaRequest(options: {
  url: string
  username: string
  fetchImpl?: typeof fetch
}): Promise<void> {
  if (!options.url) return
  const fetchImpl = options.fetchImpl ?? fetch
  await postDiscord(
    options.url,
    `${options.username} requested more storage.`,
    fetchImpl,
  )
}
