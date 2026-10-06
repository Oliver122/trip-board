import type { Pool } from 'pg'
import { decodeCursor, iso, listPage, num } from './page.js'

type AuditRow = {
  id: string | number
  admin_id: string | null
  admin_name: string | null
  action: string
  target_user_id: string | null
  target_user_name: string | null
  target_trip_id: string | null
  before: unknown
  after: unknown
  reason: string | null
  created_at: Date
}

export async function listAudit(
  pool: Pool,
  query: { admin?: string; target?: string; action?: string; cursor?: string },
) {
  const cursor = decodeCursor(query.cursor)
  if (cursor === 'invalid') return { error: 'invalid_cursor' as const }
  const params: unknown[] = []
  const where = ['TRUE']
  if (query.admin) {
    params.push(query.admin)
    where.push(`a.admin_id = $${params.length}`)
  }
  if (query.target) {
    params.push(query.target)
    where.push(`a.target_user_id = $${params.length}`)
  }
  if (query.action) {
    params.push(query.action)
    where.push(`a.action = $${params.length}`)
  }
  const page = await listPage(pool, {
    select: `
      a.id, a.admin_id, COALESCE(admin_user.display_name, admin_user.username) AS admin_name,
      a.action, a.target_user_id,
      COALESCE(target_user.display_name, target_user.username) AS target_user_name,
      a.target_trip_id, a.before, a.after, a.reason, a.created_at,
      to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS sort_key
    `,
    from: `
      FROM admin_audit_log a
      LEFT JOIN users admin_user ON admin_user.id = a.admin_id
      LEFT JOIN users target_user ON target_user.id = a.target_user_id
    `,
    where: where.join(' AND '),
    params,
    sort: {
      expr: `to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      cast: 'text',
    },
    dir: 'DESC',
    idExpr: 'a.id',
    idCast: 'bigint',
    cursor,
    key: (row) => String(row.sort_key),
    id: (row) => String((row as AuditRow).id),
    map: (row) => {
      const entry = row as AuditRow
      return {
        id: num(entry.id),
        adminId: entry.admin_id,
        adminName: entry.admin_name,
        action: entry.action,
        targetUserId: entry.target_user_id,
        targetUserName: entry.target_user_name,
        targetTripId: entry.target_trip_id,
        before: entry.before,
        after: entry.after,
        reason: entry.reason,
        createdAt: iso(entry.created_at)!,
      }
    },
  })
  return { entries: page.rows, nextCursor: page.nextCursor }
}
