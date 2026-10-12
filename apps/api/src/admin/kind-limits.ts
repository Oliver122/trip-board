import type { AdminKindLimit, KindLimitPatch } from '@tripboard/shared'
import type { Pool, PoolClient } from 'pg'
import { notifyTrip } from '../activity/record.js'
import { withTransaction } from '../db/transaction.js'
import { writeAudit } from './audit.js'
import { finishWrite, type AdminHooks } from './hooks.js'
import { decodeCursor, iso, listPage, num } from './page.js'

const requestSortKey = `(CASE WHEN r.status = 'pending' THEN '0' ELSE '1' END) || lpad((100000000000000000 - (EXTRACT(EPOCH FROM r.created_at) * 1000)::bigint)::text, 18, '0')`

const requestSelect = `
  r.id, r.trip_id, t.name AS trip_name, r.requested_by,
  COALESCE(u.display_name, u.username) AS requested_by_name,
  r.requested_max, COALESCE(t.max_kinds, s.default_max_kinds) AS current_limit,
  (SELECT count(*)::int FROM spot_kinds k WHERE k.trip_id = r.trip_id) AS kind_count,
  r.message, r.status, r.decision_note, r.decided_by, r.decided_at, r.created_at
`

const requestFrom = `
  FROM kind_limit_requests r
  JOIN trips t ON t.id = r.trip_id
  CROSS JOIN app_settings s
  LEFT JOIN users u ON u.id = r.requested_by
`

type RequestRow = {
  id: string
  trip_id: string
  trip_name: string
  requested_by: string | null
  requested_by_name: string | null
  requested_max: number
  current_limit: number
  kind_count: number
  message: string | null
  status: 'pending' | 'approved' | 'rejected'
  decision_note: string | null
  decided_by: string | null
  decided_at: Date | null
  created_at: Date
}

function toKindRequest(row: RequestRow) {
  return {
    id: row.id,
    tripId: row.trip_id,
    tripName: row.trip_name,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    requestedMax: num(row.requested_max),
    currentLimit: num(row.current_limit),
    kindCount: num(row.kind_count),
    message: row.message,
    status: row.status,
    decisionNote: row.decision_note,
    decidedBy: row.decided_by,
    decidedAt: iso(row.decided_at),
    createdAt: iso(row.created_at)!,
  }
}

type LimitRow = {
  override: number | null
  default_max: number
  count: number
}

function toKindLimit(row: LimitRow): AdminKindLimit {
  return {
    effective: num(row.override ?? row.default_max),
    override: row.override === null ? null : num(row.override),
    default: num(row.default_max),
    count: num(row.count),
  }
}

const limitSql = `
  SELECT t.max_kinds AS override, s.default_max_kinds AS default_max,
         (SELECT count(*)::int FROM spot_kinds k WHERE k.trip_id = t.id) AS count
  FROM trips t CROSS JOIN app_settings s
  WHERE t.id = $1
`

export async function readKindLimit(
  db: Pool | PoolClient,
  tripId: string,
): Promise<AdminKindLimit | null> {
  const result = await db.query<LimitRow>(limitSql, [tripId])
  const row = result.rows[0]
  return row ? toKindLimit(row) : null
}

export async function setKindLimitOverride(
  pool: Pool,
  adminId: string,
  tripId: string,
  input: KindLimitPatch,
  hooks: AdminHooks,
) {
  return withTransaction(pool, async (tx) => {
    const locked = await tx.query(
      'SELECT 1 FROM trips WHERE id = $1 FOR UPDATE',
      [tripId],
    )
    if (locked.rowCount === 0) {
      return { ok: false as const, status: 404, error: 'not_found' }
    }
    const before = await readKindLimit(tx, tripId)
    await tx.query('UPDATE trips SET max_kinds = $2 WHERE id = $1', [
      tripId,
      input.maxKinds,
    ])
    const after = await readKindLimit(tx, tripId)
    await writeAudit(tx, {
      adminId,
      action: 'trip.kind_limit',
      targetTripId: tripId,
      before,
      after,
      reason: input.reason,
    })
    await notifyTrip(tx, {
      tripId,
      resource: 'kind',
      action: 'kind.limit_update',
      actorId: adminId,
    })
    await finishWrite(hooks)
    return { ok: true as const, kindLimit: after! }
  })
}

export async function listKindLimitRequests(
  pool: Pool,
  query: { status?: 'pending' | 'approved' | 'rejected'; cursor?: string },
) {
  const cursor = decodeCursor(query.cursor)
  if (cursor === 'invalid') return { error: 'invalid_cursor' as const }
  const params: unknown[] = []
  const where = ['TRUE']
  if (query.status) {
    params.push(query.status)
    where.push(`r.status = $${params.length}`)
  }
  const pending = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM kind_limit_requests WHERE status = 'pending'`,
  )
  const page = await listPage(pool, {
    select: `${requestSelect}, ${requestSortKey} AS sort_key`,
    from: requestFrom,
    where: where.join(' AND '),
    params,
    sort: { expr: requestSortKey, cast: 'text' },
    dir: 'ASC',
    idExpr: 'r.id',
    idCast: 'uuid',
    cursor,
    key: (row) => String(row.sort_key),
    id: (row) => String(row.id),
    map: (row) => toKindRequest(row as RequestRow),
  })
  return {
    requests: page.rows,
    pendingCount: pending.rows[0]?.n ?? 0,
    nextCursor: page.nextCursor,
  }
}

type Pending = { id: string; trip_id: string; requested_max: number }

async function lockPending(tx: PoolClient, requestId: string) {
  const found = await tx.query<Pending & { status: string }>(
    `
    SELECT id, trip_id, requested_max, status
    FROM kind_limit_requests WHERE id = $1 FOR UPDATE
    `,
    [requestId],
  )
  const request = found.rows[0]
  if (!request) return { ok: false as const, status: 404, error: 'not_found' }
  if (request.status !== 'pending') {
    return { ok: false as const, status: 409, error: 'decided' }
  }
  return { ok: true as const, request }
}

export async function approveKindLimitRequest(
  pool: Pool,
  adminId: string,
  requestId: string,
  input: { maxKinds?: number; note?: string },
  now: Date,
  hooks: AdminHooks,
) {
  return withTransaction(pool, async (tx) => {
    const locked = await lockPending(tx, requestId)
    if (!locked.ok) return locked
    const { request } = locked
    const tripId = request.trip_id
    await tx.query('SELECT 1 FROM trips WHERE id = $1 FOR UPDATE', [tripId])
    const value = input.maxKinds ?? num(request.requested_max)
    const before = await readKindLimit(tx, tripId)
    await tx.query('UPDATE trips SET max_kinds = $2 WHERE id = $1', [
      tripId,
      value,
    ])
    await tx.query(
      `
      UPDATE kind_limit_requests
      SET status = 'approved', decided_by = $2, decided_at = $3, decision_note = $4
      WHERE id = $1
      `,
      [requestId, adminId, now, input.note ?? null],
    )
    await writeAudit(tx, {
      adminId,
      action: 'kind_limit_request.approve',
      targetTripId: tripId,
      before: { ...before, requestStatus: 'pending' },
      after: {
        ...(await readKindLimit(tx, tripId)),
        requestStatus: 'approved',
      },
      reason: input.note,
    })
    await notifyTrip(tx, {
      tripId,
      resource: 'kind',
      action: 'kind.limit_update',
      id: requestId,
      actorId: adminId,
    })
    await finishWrite(hooks)
    return { ok: true as const }
  })
}

export async function rejectKindLimitRequest(
  pool: Pool,
  adminId: string,
  requestId: string,
  note: string | undefined,
  now: Date,
  hooks: AdminHooks,
) {
  return withTransaction(pool, async (tx) => {
    const locked = await lockPending(tx, requestId)
    if (!locked.ok) return locked
    const tripId = locked.request.trip_id
    await tx.query(
      `
      UPDATE kind_limit_requests
      SET status = 'rejected', decided_by = $2, decided_at = $3, decision_note = $4
      WHERE id = $1
      `,
      [requestId, adminId, now, note ?? null],
    )
    await writeAudit(tx, {
      adminId,
      action: 'kind_limit_request.reject',
      targetTripId: tripId,
      before: { requestStatus: 'pending' },
      after: { requestStatus: 'rejected' },
      reason: note,
    })
    await notifyTrip(tx, {
      tripId,
      resource: 'kind',
      action: 'kind.limit_update',
      id: requestId,
      actorId: adminId,
    })
    await finishWrite(hooks)
    return { ok: true as const }
  })
}
