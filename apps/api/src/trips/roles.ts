import type { TripRole } from '@tripboard/shared'
import type { Pool, PoolClient } from 'pg'

const rank: Record<TripRole, number> = {
  visitor: 0,
  planner: 1,
  owner: 2,
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
  const role = parseRole(row.role)
  const decision = decideTripAccess(role, min)
  if (decision === 'allow' && role) return { ok: true, role }
  if (decision === 'deny') return { ok: false, status: 403 }
  return { ok: false, status: 404 }
}

function parseRole(value: string | null): TripRole | null {
  if (value === 'visitor' || value === 'planner' || value === 'owner')
    return value
  return null
}
