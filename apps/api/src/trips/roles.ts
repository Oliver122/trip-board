import type { TripRole } from '@tripboard/shared'
import type { Pool, PoolClient } from 'pg'

const rank: Record<TripRole, number> = {
  visitor: 0,
  planner: 1,
  admin: 2,
  owner: 3,
}

export function roleSatisfies(actual: TripRole, min: TripRole): boolean {
  return rank[actual] >= rank[min]
}

export function decideTripAccess(
  role: TripRole | null,
  min: TripRole,
): 'allow' | 'deny' | 'missing' {
  if (!role) return 'missing'
  return roleSatisfies(role, min) ? 'allow' : 'deny'
}

type Queryable = Pool | PoolClient

export async function requireTripRole(
  db: Queryable,
  tripId: string,
  userId: string,
  min: TripRole,
): Promise<{ ok: true; role: TripRole } | { ok: false; status: 403 | 404 }> {
  const result = await db.query<{ role: string | null }>(
    `
    SELECT m.role
    FROM trips t
    LEFT JOIN trip_members m ON m.trip_id = t.id AND m.user_id = $2
    WHERE t.id = $1
    `,
    [tripId, userId],
  )
  const row = result.rows[0]
  if (!row) return { ok: false, status: 404 }
  const role = parseTripRole(row.role)
  const decision = decideTripAccess(role, min)
  if (decision === 'allow' && role) return { ok: true, role }
  if (decision === 'deny') return { ok: false, status: 403 }
  return { ok: false, status: 404 }
}

export function parseTripRole(
  value: string | null | undefined,
): TripRole | null {
  if (
    value === 'visitor' ||
    value === 'planner' ||
    value === 'admin' ||
    value === 'owner'
  )
    return value
  return null
}

/** Unknown stored roles fall back to the least privilege, and are logged. */
export function roleOrVisitor(
  value: string | null | undefined,
  log?: { warn: (message: string) => void },
): TripRole {
  const role = parseTripRole(value)
  if (role) return role
  const message = `unknown trip role "${String(value)}", treating as visitor`
  if (log) log.warn(message)
  else console.warn(message)
  return 'visitor'
}
