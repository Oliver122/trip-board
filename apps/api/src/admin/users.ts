import type { Pool } from 'pg'
import { withTransaction } from '../db/transaction.js'
import { writeAudit } from './audit.js'
import { finishWrite, type AdminHooks } from './hooks.js'
import { listRequestsForUser } from './requests.js'
import { activitySparkline } from './spark.js'
import {
  decodeCursor,
  iso,
  likePattern,
  listPage,
  num,
  type SortSpec,
} from './page.js'

function timestampKey(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
}

const userSorts: Record<string, SortSpec> = {
  username: { expr: 'lower(username)', cast: 'text' },
  discordId: { expr: 'discord_id', cast: 'text' },
  displayName: { expr: "lower(COALESCE(display_name, ''))", cast: 'text' },
  role: { expr: 'app_role::text', cast: 'text' },
  createdAt: { expr: timestampKey('created_at'), cast: 'text' },
  lastLoginAt: {
    expr: timestampKey("COALESCE(last_login_at, 'epoch'::timestamptz)"),
    cast: 'text',
  },
  lastSeenAt: {
    expr: timestampKey("COALESCE(last_seen_at, 'epoch'::timestamptz)"),
    cast: 'text',
  },
  lastActivityAt: {
    expr: timestampKey("COALESCE(last_activity_at, 'epoch'::timestamptz)"),
    cast: 'text',
  },
  suspendedAt: {
    expr: timestampKey("COALESCE(suspended_at, 'epoch'::timestamptz)"),
    cast: 'text',
  },
  tripsMember: { expr: 'trips_member', cast: 'int' },
  tripsOwned: { expr: 'trips_owned', cast: 'int' },
  spotsCreated: { expr: 'spots_created', cast: 'int' },
  usedImages: { expr: 'used_images', cast: 'int' },
  usedBytes: { expr: 'used_bytes', cast: 'bigint' },
  maxImages: { expr: 'max_images', cast: 'int' },
  maxBytes: { expr: 'max_bytes', cast: 'bigint' },
  events30d: { expr: 'events_30d', cast: 'int' },
}

type UserRow = {
  id: string
  discord_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  app_role: 'user' | 'admin'
  created_at: Date
  last_login_at: Date | null
  last_seen_at: Date | null
  suspended_at: Date | null
  used_images: number
  max_images: number
  used_bytes: string | number
  max_bytes: string | number
  has_override: boolean
  trips_member: number
  trips_owned: number
  spots_created: number
  events_30d: number
  last_activity_at: Date | null
}

export type UserListQuery = {
  q?: string
  filter?: 'admins' | 'suspended' | 'quota' | 'inactive'
  sort?: string
  dir?: 'asc' | 'desc'
  cursor?: string
}

const filters: Record<NonNullable<UserListQuery['filter']>, string> = {
  admins: `app_role = 'admin'`,
  suspended: `suspended_at IS NOT NULL`,
  quota: `((max_bytes > 0 AND used_bytes::numeric / max_bytes >= 0.8) OR (max_images > 0 AND used_images::numeric / max_images >= 0.8))`,
  inactive: `COALESCE(last_activity_at, last_seen_at, last_login_at, created_at) < now() - interval '90 days'`,
}

export function toAdminUser(row: UserRow) {
  return {
    id: row.id,
    discordId: row.discord_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    appRole: row.app_role,
    createdAt: iso(row.created_at)!,
    lastLoginAt: iso(row.last_login_at),
    lastSeenAt: iso(row.last_seen_at),
    suspendedAt: iso(row.suspended_at),
    usedImages: num(row.used_images),
    maxImages: num(row.max_images),
    usedBytes: num(row.used_bytes),
    maxBytes: num(row.max_bytes),
    hasOverride: row.has_override,
    tripsMember: num(row.trips_member),
    tripsOwned: num(row.trips_owned),
    spotsCreated: num(row.spots_created),
    events30d: num(row.events_30d),
    lastActivityAt: iso(row.last_activity_at),
  }
}

export async function listUsers(pool: Pool, query: UserListQuery) {
  const cursor = decodeCursor(query.cursor)
  if (cursor === 'invalid') return { error: 'invalid_cursor' as const }
  const sort = userSorts[query.sort ?? 'createdAt'] ?? userSorts.createdAt!
  const dir = query.dir === 'asc' ? 'ASC' : 'DESC'
  const params: unknown[] = []
  const where = ['TRUE']
  if (query.q) {
    params.push(likePattern(query.q))
    where.push(
      `(username ILIKE $${params.length} ESCAPE '\\' OR COALESCE(display_name, '') ILIKE $${params.length} ESCAPE '\\' OR discord_id ILIKE $${params.length} ESCAPE '\\')`,
    )
  }
  if (query.filter) where.push(filters[query.filter])
  const page = await listPage(pool, {
    select: `*, ${sort.expr} AS sort_key`,
    from: 'FROM admin_user_overview',
    where: where.join(' AND '),
    params,
    sort,
    dir,
    idCast: 'uuid',
    cursor,
    key: (row) => String(row.sort_key),
    id: (row) => String(row.id),
    map: (row) => toAdminUser(row as UserRow),
  })
  return { users: page.rows, nextCursor: page.nextCursor }
}

export async function getAdminUser(pool: Pool, id: string) {
  const overview = await pool.query<UserRow>(
    'SELECT * FROM admin_user_overview WHERE id = $1',
    [id],
  )
  const row = overview.rows[0]
  if (!row) return null
  const [profile, trips, actions, requests, defaults, sparkline] =
    await Promise.all([
      pool.query<{ suspended_reason: string | null }>(
        'SELECT suspended_reason FROM users WHERE id = $1',
        [id],
      ),
      pool.query<{
        id: string
        name: string
        role: 'owner' | 'planner' | 'visitor'
      }>(
        `
      SELECT t.id, t.name, m.role
      FROM trip_members m
      JOIN trips t ON t.id = m.trip_id
      WHERE m.user_id = $1
      ORDER BY t.name, t.id
      `,
        [id],
      ),
      pool.query(
        `
      SELECT e.id, e.action, e.metadata, e.created_at, e.actor_id, e.trip_id,
             COALESCE(u.display_name, u.username) AS actor_name,
             t.name AS trip_name
      FROM activity_events e
      LEFT JOIN users u ON u.id = e.actor_id
      LEFT JOIN trips t ON t.id = e.trip_id
      WHERE e.actor_id = $1
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 20
      `,
        [id],
      ),
      listRequestsForUser(pool, id),
      pool.query<{ default_max_images: number; default_max_bytes: string }>(
        'SELECT default_max_images, default_max_bytes FROM app_settings WHERE id = true',
      ),
      activitySparkline(pool, 'actor_id', id),
    ])
  const settings = defaults.rows[0]
  return {
    user: toAdminUser(row),
    suspendedReason: profile.rows[0]?.suspended_reason ?? null,
    defaults: {
      maxImages: num(settings?.default_max_images),
      maxBytes: num(settings?.default_max_bytes),
    },
    trips: trips.rows,
    actions: actions.rows.map(toAction),
    quotaRequests: requests,
    sparkline,
  }
}

export async function updateQuota(
  pool: Pool,
  adminId: string,
  userId: string,
  input: {
    maxImages?: number
    maxBytes?: number
    reset?: boolean
    reason?: string
  },
  hooks: AdminHooks,
) {
  return withTransaction(pool, async (tx) => {
    const current = await tx.query<{
      max_images: number | null
      max_bytes: string | null
    }>('SELECT max_images, max_bytes FROM users WHERE id = $1 FOR UPDATE', [
      userId,
    ])
    const before = current.rows[0]
    if (!before) return { ok: false as const, status: 404 }
    const beforeValue = {
      maxImages: before.max_images,
      maxBytes: before.max_bytes === null ? null : num(before.max_bytes),
    }
    const afterValue = input.reset
      ? { maxImages: null, maxBytes: null }
      : {
          maxImages:
            input.maxImages !== undefined
              ? input.maxImages
              : beforeValue.maxImages,
          maxBytes:
            input.maxBytes !== undefined
              ? input.maxBytes
              : beforeValue.maxBytes,
        }
    await tx.query(
      'UPDATE users SET max_images = $2, max_bytes = $3 WHERE id = $1',
      [userId, afterValue.maxImages, afterValue.maxBytes],
    )
    await writeAudit(tx, {
      adminId,
      action: 'user.quota_update',
      targetUserId: userId,
      before: beforeValue,
      after: afterValue,
      reason: input.reason,
    })
    await finishWrite(hooks)
    const overview = await tx.query<UserRow>(
      'SELECT * FROM admin_user_overview WHERE id = $1',
      [userId],
    )
    return { ok: true as const, user: toAdminUser(overview.rows[0]!) }
  })
}

export async function suspendUser(
  pool: Pool,
  adminId: string,
  userId: string,
  reason: string,
  now: Date,
  hooks: AdminHooks,
) {
  return withTransaction(pool, async (tx) => {
    if (adminId === userId)
      return { ok: false as const, status: 400, error: 'self' }
    const locked = await tx.query<{
      id: string
      app_role: string
      suspended_at: Date | null
    }>(
      `SELECT id, app_role, suspended_at FROM users WHERE app_role = 'admin' OR id = $1 FOR UPDATE`,
      [userId],
    )
    const target = locked.rows.find((row) => row.id === userId)
    if (!target) return { ok: false as const, status: 404, error: 'not_found' }
    const activeAdmins = locked.rows.filter(
      (row) => row.app_role === 'admin' && row.suspended_at === null,
    )
    if (target.app_role === 'admin' && activeAdmins.length <= 1) {
      return { ok: false as const, status: 409, error: 'last_admin' }
    }
    const before = { suspendedAt: iso(target.suspended_at) }
    await tx.query(
      'UPDATE users SET suspended_at = $2, suspended_reason = $3 WHERE id = $1',
      [userId, now, reason],
    )
    const after = { suspendedAt: now.toISOString(), suspendedReason: reason }
    await writeAudit(tx, {
      adminId,
      action: 'user.suspend',
      targetUserId: userId,
      before,
      after,
      reason,
    })
    await finishWrite(hooks)
    return { ok: true as const }
  })
}

export async function unsuspendUser(
  pool: Pool,
  adminId: string,
  userId: string,
  hooks: AdminHooks,
) {
  return withTransaction(pool, async (tx) => {
    const current = await tx.query<{
      suspended_at: Date | null
      suspended_reason: string | null
    }>(
      'SELECT suspended_at, suspended_reason FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    )
    const before = current.rows[0]
    if (!before) return { ok: false as const, status: 404 }
    await tx.query(
      'UPDATE users SET suspended_at = NULL, suspended_reason = NULL WHERE id = $1',
      [userId],
    )
    await writeAudit(tx, {
      adminId,
      action: 'user.unsuspend',
      targetUserId: userId,
      before: {
        suspendedAt: iso(before.suspended_at),
        suspendedReason: before.suspended_reason,
      },
      after: { suspendedAt: null, suspendedReason: null },
    })
    await finishWrite(hooks)
    return { ok: true as const }
  })
}

export async function setUserRole(
  pool: Pool,
  adminId: string,
  userId: string,
  appRole: 'user' | 'admin',
  hooks: AdminHooks,
) {
  return withTransaction(pool, async (tx) => {
    const locked = await tx.query<{ id: string; app_role: 'user' | 'admin' }>(
      `SELECT id, app_role FROM users WHERE app_role = 'admin' OR id = $1 FOR UPDATE`,
      [userId],
    )
    const target = locked.rows.find((row) => row.id === userId)
    if (!target) return { ok: false as const, status: 404, error: 'not_found' }
    const admins = locked.rows.filter((row) => row.app_role === 'admin')
    if (
      target.app_role === 'admin' &&
      appRole === 'user' &&
      admins.length <= 1
    ) {
      return { ok: false as const, status: 409, error: 'last_admin' }
    }
    await tx.query('UPDATE users SET app_role = $2 WHERE id = $1', [
      userId,
      appRole,
    ])
    await writeAudit(tx, {
      adminId,
      action: 'user.role_update',
      targetUserId: userId,
      before: { appRole: target.app_role },
      after: { appRole },
    })
    await finishWrite(hooks)
    return { ok: true as const }
  })
}

export async function logoutUser(
  pool: Pool,
  adminId: string,
  userId: string,
  hooks: AdminHooks,
) {
  return withTransaction(pool, async (tx) => {
    const exists = await tx.query(
      'SELECT 1 FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    )
    if ((exists.rowCount ?? 0) === 0) return { ok: false as const, status: 404 }
    const removed = await tx.query('DELETE FROM sessions WHERE user_id = $1', [
      userId,
    ])
    const count = removed.rowCount ?? 0
    await writeAudit(tx, {
      adminId,
      action: 'user.logout_all',
      targetUserId: userId,
      before: { sessions: count },
      after: { sessions: 0 },
    })
    await finishWrite(hooks)
    return { ok: true as const }
  })
}

export function toAction(row: {
  id: string | number
  action: string
  metadata: unknown
  created_at: Date
  actor_id: string | null
  actor_name: string | null
  trip_id: string | null
  trip_name?: string | null
}) {
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
    tripName: row.trip_name ?? null,
  }
}
