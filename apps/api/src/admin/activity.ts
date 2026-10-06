import type { ActivityEvent } from '@tripboard/shared'
import { Readable } from 'node:stream'
import type { Pool } from 'pg'
import { csvField } from '../export/csv.js'
import { decodeCursor, encodeCursor, iso, num } from './page.js'

export const activityPageSize = 50
export const activityExportLimit = 100_000

export type ActivityQuery = {
  user?: string
  trip?: string
  action?: string
  from?: string
  to?: string
  cursor?: string
}

type ActivityRow = {
  id: string
  action: string
  metadata: unknown
  created_at: Date
  actor_id: string | null
  actor_name: string | null
  trip_id: string | null
  trip_name: string | null
  cursor_key: string
}

const selectList = `
  e.id, e.action, e.metadata, e.created_at, e.actor_id, e.trip_id,
  COALESCE(u.display_name, u.username) AS actor_name,
  t.name AS trip_name,
  to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS cursor_key
`

function filters(query: ActivityQuery): { where: string; params: unknown[] } {
  const parts = ['TRUE']
  const params: unknown[] = []
  const add = (sql: string, value: unknown) => {
    params.push(value)
    parts.push(sql.replaceAll('$?', `$${params.length}`))
  }
  if (query.user) add('e.actor_id = $?::uuid', query.user)
  if (query.trip) add('e.trip_id = $?::uuid', query.trip)
  if (query.action) {
    if (query.action.endsWith('.*')) {
      add('e.action LIKE $?', `${query.action.slice(0, -1)}%`)
    } else add('e.action = $?', query.action)
  }
  if (query.from)
    add("(e.created_at AT TIME ZONE 'UTC')::date >= $?::date", query.from)
  if (query.to)
    add("(e.created_at AT TIME ZONE 'UTC')::date <= $?::date", query.to)
  return { where: parts.join(' AND '), params }
}

function toEvent(row: ActivityRow): ActivityEvent {
  const metadata =
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}
  return {
    id: num(row.id),
    action: row.action,
    metadata,
    createdAt: iso(row.created_at)!,
    actorId: row.actor_id,
    actorName: row.actor_name,
    tripId: row.trip_id,
    tripName: row.trip_name,
  }
}

async function fetchPage(
  pool: Pool,
  query: ActivityQuery,
  limit: number,
): Promise<{ rows: ActivityRow[]; params: unknown[] }> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null
  if (cursor === 'invalid')
    throw Object.assign(new Error('cursor'), { code: '22P02' })
  const built = filters(query)
  const params = [...built.params]
  let cursorSql = ''
  if (cursor) {
    params.push(cursor.k, cursor.id)
    const key = params.length - 1
    const id = params.length
    cursorSql = `AND (e.created_at AT TIME ZONE 'UTC', e.id) < ($${key}::timestamp, $${id}::bigint)`
  }
  params.push(limit)
  const result = await pool.query<ActivityRow>(
    `
    SELECT ${selectList}
    FROM activity_events e
    LEFT JOIN users u ON u.id = e.actor_id
    LEFT JOIN trips t ON t.id = e.trip_id
    WHERE ${built.where}
    ${cursorSql}
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT $${params.length}
    `,
    params,
  )
  return { rows: result.rows, params }
}

export async function listActivity(pool: Pool, query: ActivityQuery) {
  if (query.cursor && decodeCursor(query.cursor) === 'invalid') {
    return { error: 'invalid_cursor' as const }
  }
  const { rows } = await fetchPage(pool, query, activityPageSize + 1)
  const page = rows.slice(0, activityPageSize)
  const last = page[page.length - 1]
  const nextCursor =
    rows.length > activityPageSize && last
      ? encodeCursor(last.cursor_key, String(last.id))
      : null
  return { events: page.map(toEvent), nextCursor }
}

export function activityCsv(pool: Pool, query: ActivityQuery): Readable {
  return Readable.from(csvRows(pool, query))
}

async function* csvRows(
  pool: Pool,
  query: ActivityQuery,
): AsyncGenerator<string> {
  yield `\uFEFF${['id', 'created_at', 'actor', 'action', 'trip', 'metadata'].map(csvField).join(',')}\r\n`
  let cursor: string | undefined
  let remaining = activityExportLimit
  const batch = 1000
  while (remaining > 0) {
    const limit = Math.min(batch, remaining)
    const { rows } = await fetchPage(pool, { ...query, cursor }, limit)
    if (rows.length === 0) return
    for (const row of rows) {
      const event = toEvent(row)
      yield `${[
        String(event.id),
        event.createdAt,
        event.actorName ?? '',
        event.action,
        event.tripName ?? '',
        JSON.stringify(event.metadata),
      ]
        .map(csvField)
        .join(',')}\r\n`
    }
    remaining -= rows.length
    const last = rows[rows.length - 1]
    if (!last || rows.length < limit) return
    cursor = encodeCursor(last.cursor_key, String(last.id))
  }
}
