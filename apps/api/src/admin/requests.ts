import type { Pool, PoolClient } from 'pg'
import { activity } from '../activity/record.js'
import { withTransaction } from '../db/transaction.js'
import { writeAudit } from './audit.js'
import { finishWrite, type AdminHooks } from './hooks.js'
import { decodeCursor, iso, isUniqueViolation, listPage, num } from './page.js'

const requestSortKey = `(CASE WHEN r.status = 'pending' THEN '0' ELSE '1' END) || lpad((100000000000000000 - (EXTRACT(EPOCH FROM r.created_at) * 1000)::bigint)::text, 18, '0')`

const requestSelect = `
  r.id, r.user_id, u.username, u.display_name,
  r.requested_images, r.requested_bytes, r.message, r.status,
  r.decision_note, r.decided_by, r.decided_at, r.created_at,
  q.used_images, q.max_images, q.used_bytes, q.max_bytes
`

type RequestRow = {
  id: string
  user_id: string
  username: string
  display_name: string | null
  requested_images: number | null
  requested_bytes: string | number | null
  message: string | null
  status: 'pending' | 'approved' | 'rejected'
  decision_note: string | null
  decided_by: string | null
  decided_at: Date | null
  created_at: Date
  used_images: number
  max_images: number
  used_bytes: string | number
  max_bytes: string | number
}

export function toRequest(row: RequestRow) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    requestedImages: row.requested_images,
    requestedBytes:
      row.requested_bytes === null ? null : num(row.requested_bytes),
    message: row.message,
    status: row.status,
    decisionNote: row.decision_note,
    decidedBy: row.decided_by,
    decidedAt: iso(row.decided_at),
    createdAt: iso(row.created_at)!,
    usedImages: num(row.used_images),
    maxImages: num(row.max_images),
    usedBytes: num(row.used_bytes),
    maxBytes: num(row.max_bytes),
  }
}

export async function listRequestsForUser(
  db: Pool | PoolClient,
  userId: string,
) {
  const result = await db.query<RequestRow>(
    `
    SELECT ${requestSelect}
    FROM quota_requests r
    JOIN users u ON u.id = r.user_id
    JOIN user_quota_usage q ON q.user_id = r.user_id
    WHERE r.user_id = $1
    ORDER BY r.created_at DESC, r.id DESC
    `,
    [userId],
  )
  return result.rows.map(toRequest)
}

export async function createQuotaRequest(
  pool: Pool,
  userId: string,
  input: { images?: number; bytes?: number; message?: string },
) {
  try {
    return await withTransaction(pool, async (tx) => {
      const inserted = await tx.query<{ id: string }>(
        `
        INSERT INTO quota_requests (user_id, requested_images, requested_bytes, message)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [
          userId,
          input.images ?? null,
          input.bytes ?? null,
          input.message ?? null,
        ],
      )
      const id = inserted.rows[0]?.id
      if (!id) throw new Error('request insert failed')
      await activity.record(tx, {
        actor: userId,
        trip: null,
        action: 'quota.request',
        entityId: id,
        metadata: {
          images: input.images ?? null,
          bytes: input.bytes ?? null,
        },
      })
      const rows = await tx.query<RequestRow>(
        `
        SELECT ${requestSelect}
        FROM quota_requests r
        JOIN users u ON u.id = r.user_id
        JOIN user_quota_usage q ON q.user_id = r.user_id
        WHERE r.id = $1
        `,
        [id],
      )
      return { ok: true as const, request: toRequest(rows.rows[0]!) }
    })
  } catch (error) {
    if (isUniqueViolation(error))
      return { ok: false as const, status: 409, error: 'pending' }
    throw error
  }
}

export async function listQuotaRequests(
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
    `SELECT count(*)::int AS n FROM quota_requests WHERE status = 'pending'`,
  )
  const page = await listPage(pool, {
    select: `${requestSelect}, ${requestSortKey} AS sort_key`,
    from: `
      FROM quota_requests r
      JOIN users u ON u.id = r.user_id
      JOIN user_quota_usage q ON q.user_id = r.user_id
    `,
    where: where.join(' AND '),
    params,
    sort: { expr: requestSortKey, cast: 'text' },
    dir: 'ASC',
    idExpr: 'r.id',
    idCast: 'uuid',
    cursor,
    key: (row) => String(row.sort_key),
    id: (row) => String(row.id),
    map: (row) => toRequest(row as RequestRow),
  })
  return {
    requests: page.rows,
    pendingCount: pending.rows[0]?.n ?? 0,
    nextCursor: page.nextCursor,
  }
}

export async function approveQuotaRequest(
  pool: Pool,
  adminId: string,
  requestId: string,
  input: { images?: number; bytes?: number; note?: string },
  now: Date,
  hooks: AdminHooks,
) {
  return withTransaction(pool, async (tx) => {
    const found = await tx.query<{
      id: string
      user_id: string
      status: string
      requested_images: number | null
      requested_bytes: string | null
    }>(
      `
      SELECT id, user_id, status, requested_images, requested_bytes
      FROM quota_requests
      WHERE id = $1
      FOR UPDATE
      `,
      [requestId],
    )
    const request = found.rows[0]
    if (!request) return { ok: false as const, status: 404, error: 'not_found' }
    if (request.status !== 'pending') {
      return { ok: false as const, status: 409, error: 'decided' }
    }
    const explicit = input.images !== undefined || input.bytes !== undefined
    const addImages = explicit
      ? input.images
      : (request.requested_images ?? undefined)
    const addBytes = explicit
      ? input.bytes
      : request.requested_bytes === null
        ? undefined
        : num(request.requested_bytes)
    if (addImages === undefined && addBytes === undefined) {
      return { ok: false as const, status: 400, error: 'invalid_request' }
    }
    const user = await tx.query<{
      max_images: number | null
      max_bytes: string | null
    }>('SELECT max_images, max_bytes FROM users WHERE id = $1 FOR UPDATE', [
      request.user_id,
    ])
    const limits = await tx.query<{ max_images: number; max_bytes: string }>(
      'SELECT max_images, max_bytes FROM user_quota_usage WHERE user_id = $1',
      [request.user_id],
    )
    const current = user.rows[0]
    const effective = limits.rows[0]
    if (!current || !effective)
      return { ok: false as const, status: 404, error: 'not_found' }
    const before = {
      maxImages: current.max_images,
      maxBytes: current.max_bytes === null ? null : num(current.max_bytes),
      requestStatus: 'pending',
    }
    const nextImages =
      addImages === undefined
        ? current.max_images
        : num(effective.max_images) + addImages
    const nextBytes =
      addBytes === undefined
        ? current.max_bytes
        : num(effective.max_bytes) + addBytes
    await tx.query(
      'UPDATE users SET max_images = $2, max_bytes = $3 WHERE id = $1',
      [request.user_id, nextImages, nextBytes === null ? null : num(nextBytes)],
    )
    await tx.query(
      `
      UPDATE quota_requests
      SET status = 'approved', decided_by = $2, decided_at = $3, decision_note = $4
      WHERE id = $1
      `,
      [requestId, adminId, now, input.note ?? null],
    )
    const after = {
      maxImages: nextImages,
      maxBytes: nextBytes === null ? null : num(nextBytes),
      requestStatus: 'approved',
    }
    await writeAudit(tx, {
      adminId,
      action: 'quota_request.approve',
      targetUserId: request.user_id,
      before,
      after,
      reason: input.note,
    })
    await finishWrite(hooks)
    return { ok: true as const }
  })
}

export async function rejectQuotaRequest(
  pool: Pool,
  adminId: string,
  requestId: string,
  note: string | undefined,
  now: Date,
  hooks: AdminHooks,
) {
  return withTransaction(pool, async (tx) => {
    const found = await tx.query<{
      id: string
      user_id: string
      status: string
    }>(
      'SELECT id, user_id, status FROM quota_requests WHERE id = $1 FOR UPDATE',
      [requestId],
    )
    const request = found.rows[0]
    if (!request) return { ok: false as const, status: 404, error: 'not_found' }
    if (request.status !== 'pending') {
      return { ok: false as const, status: 409, error: 'decided' }
    }
    await tx.query(
      `
      UPDATE quota_requests
      SET status = 'rejected', decided_by = $2, decided_at = $3, decision_note = $4
      WHERE id = $1
      `,
      [requestId, adminId, now, note ?? null],
    )
    await writeAudit(tx, {
      adminId,
      action: 'quota_request.reject',
      targetUserId: request.user_id,
      before: { requestStatus: 'pending' },
      after: { requestStatus: 'rejected' },
      reason: note,
    })
    await finishWrite(hooks)
    return { ok: true as const }
  })
}
