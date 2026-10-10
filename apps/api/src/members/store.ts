import {
  type InviteRole,
  type JoinPreview,
  type Member,
  type TripInvite,
} from '@tripboard/shared'
import type { Pool, PoolClient } from 'pg'
import { activity } from '../activity/record.js'
import { withTransaction } from '../db/transaction.js'
import { invitePrefix, inviteSuffix, inviteTtlMs } from './code.js'
import {
  parseTripRole,
  requireTripRole,
  roleOrVisitor,
} from '../trips/roles.js'

type Queryable = Pool | PoolClient

type MemberRow = {
  user_id: string
  name: string
  avatar_url: string | null
  role: string
}

type InviteRow = {
  id: string
  code: string
  role: string
  expires_at: Date
  uses: number
}

export type MemberFailure =
  | { ok: false; status: 400; fields: Record<string, string> }
  | { ok: false; status: 403 | 404 | 409; message?: string }

export async function listMembers(
  db: Queryable,
  tripId: string,
  userId: string,
): Promise<{ ok: true; members: Member[] } | MemberFailure> {
  const access = await requireTripRole(db, tripId, userId, 'visitor')
  if (!access.ok) return access
  const members = await readMembers(db, tripId)
  return { ok: true, members }
}

export async function updateMemberRole(
  pool: Pool,
  actorId: string,
  tripId: string,
  userId: string,
  role: InviteRole,
): Promise<{ ok: true; member: Member } | MemberFailure> {
  return withTransaction(pool, async (tx) => {
    const access = await requireTripRole(tx, tripId, actorId, 'owner')
    if (!access.ok) return access
    const current = await tx.query<{ role: string }>(
      `SELECT role FROM trip_members WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId],
    )
    const row = current.rows[0]
    if (!row) return { ok: false, status: 404 }
    if (row.role === 'owner') {
      return { ok: false, status: 400, fields: { role: 'owner' } }
    }
    await tx.query(
      `UPDATE trip_members SET role = $3 WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId, role],
    )
    await activity.record(tx, {
      actor: actorId,
      trip: tripId,
      action: 'member.role_update',
      entityId: userId,
      metadata: { from: row.role, to: role },
    })
    const member = (await readMembers(tx, tripId)).find(
      (item) => item.userId === userId,
    )
    if (!member) return { ok: false, status: 404 }
    return { ok: true, member }
  })
}

export async function removeMember(
  pool: Pool,
  actorId: string,
  tripId: string,
  userId: string,
): Promise<{ ok: true } | MemberFailure> {
  return withTransaction(pool, async (tx) => {
    const access = await requireTripRole(tx, tripId, actorId, 'owner')
    if (!access.ok) return access
    const current = await tx.query<{ role: string }>(
      `SELECT role FROM trip_members WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId],
    )
    const row = current.rows[0]
    if (!row) return { ok: false, status: 404 }
    if (row.role === 'owner') return transferFirst()
    await tx.query(
      `DELETE FROM trip_members WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId],
    )
    await activity.record(tx, {
      actor: actorId,
      trip: tripId,
      action: 'member.remove',
      entityId: userId,
      metadata: { role: row.role },
    })
    return { ok: true }
  })
}

export async function leaveTrip(
  pool: Pool,
  userId: string,
  tripId: string,
): Promise<{ ok: true } | MemberFailure> {
  return withTransaction(pool, async (tx) => {
    const access = await requireTripRole(tx, tripId, userId, 'visitor')
    if (!access.ok) return access
    if (access.role === 'owner') return transferFirst()
    await tx.query(
      `DELETE FROM trip_members WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId],
    )
    await activity.record(tx, {
      actor: userId,
      trip: tripId,
      action: 'member.leave',
      entityId: userId,
      metadata: { role: access.role },
    })
    return { ok: true }
  })
}

export async function transferOwnership(
  pool: Pool,
  actorId: string,
  tripId: string,
  userId: string,
): Promise<{ ok: true; members: Member[] } | MemberFailure> {
  return withTransaction(pool, async (tx) => {
    const access = await requireTripRole(tx, tripId, actorId, 'owner')
    if (!access.ok) return access
    const target = await tx.query<{ role: string }>(
      `SELECT role FROM trip_members WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId],
    )
    const row = target.rows[0]
    if (!row)
      return { ok: false, status: 400, fields: { userId: 'not_member' } }
    if (row.role === 'owner') {
      return { ok: false, status: 400, fields: { userId: 'already_owner' } }
    }
    const demoted = await tx.query(
      `
      UPDATE trip_members SET role = 'planner'
      WHERE trip_id = $1 AND user_id = $2 AND role = 'owner'
      `,
      [tripId, actorId],
    )
    if (demoted.rowCount !== 1) {
      return { ok: false, status: 409, message: 'transfer ownership first' }
    }
    const promoted = await tx.query(
      `
      UPDATE trip_members SET role = 'owner'
      WHERE trip_id = $1 AND user_id = $2
      `,
      [tripId, userId],
    )
    if (promoted.rowCount !== 1) {
      throw new Error('ownership transfer failed')
    }
    const trip = await tx.query<{ name: string }>(
      `SELECT name FROM trips WHERE id = $1`,
      [tripId],
    )
    await activity.record(tx, {
      actor: actorId,
      trip: tripId,
      action: 'trip.transfer',
      entityId: tripId,
      metadata: {
        trip: trip.rows[0]?.name ?? '',
        from: actorId,
        to: userId,
      },
    })
    return { ok: true, members: await readMembers(tx, tripId) }
  })
}

export async function createInvite(
  pool: Pool,
  userId: string,
  tripId: string,
  role: InviteRole,
  now: Date,
): Promise<{ ok: true; invite: TripInvite } | MemberFailure> {
  return withTransaction(pool, async (tx) => {
    const access = await requireTripRole(tx, tripId, userId, 'owner')
    if (!access.ok) return access
    const trip = await tx.query<{ name: string }>(
      `SELECT name FROM trips WHERE id = $1`,
      [tripId],
    )
    const name = trip.rows[0]?.name
    if (!name) return { ok: false, status: 404 }
    const prefix = invitePrefix(name)
    const createdAt = now
    const expiresAt = new Date(now.getTime() + inviteTtlMs)
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = `${prefix}-${inviteSuffix()}`
      await tx.query('SAVEPOINT invite_code')
      try {
        const inserted = await tx.query<InviteRow>(
          `
          INSERT INTO trip_invites (
            trip_id, code, role, created_by, created_at, expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, code, role, expires_at, uses
          `,
          [tripId, code, role, userId, createdAt, expiresAt],
        )
        await tx.query('RELEASE SAVEPOINT invite_code')
        const row = inserted.rows[0]
        if (!row) throw new Error('invite insert failed')
        await activity.record(tx, {
          actor: userId,
          trip: tripId,
          action: 'invite.create',
          entityId: row.id,
          metadata: { code: row.code, role, trip: name },
        })
        return { ok: true, invite: mapInvite(row) }
      } catch (error) {
        await tx.query('ROLLBACK TO SAVEPOINT invite_code')
        if (!isUniqueViolation(error)) throw error
      }
    }
    throw new Error('invite code collision')
  })
}

export async function listInvites(
  db: Queryable,
  tripId: string,
  userId: string,
  now: Date,
): Promise<{ ok: true; invites: TripInvite[] } | MemberFailure> {
  const access = await requireTripRole(db, tripId, userId, 'owner')
  if (!access.ok) return access
  const result = await db.query<InviteRow>(
    `
    SELECT id, code, role, expires_at, uses
    FROM trip_invites
    WHERE trip_id = $1 AND revoked_at IS NULL AND expires_at > $2
    ORDER BY created_at DESC, id
    `,
    [tripId, now],
  )
  return { ok: true, invites: result.rows.map(mapInvite) }
}

export async function revokeInvite(
  pool: Pool,
  userId: string,
  inviteId: string,
  now: Date,
): Promise<{ ok: true } | MemberFailure> {
  return withTransaction(pool, async (tx) => {
    const found = await tx.query<{
      id: string
      trip_id: string
      code: string
      revoked_at: Date | null
    }>(
      `
      SELECT id, trip_id, code, revoked_at
      FROM trip_invites
      WHERE id = $1
      FOR UPDATE
      `,
      [inviteId],
    )
    const invite = found.rows[0]
    if (!invite || invite.revoked_at) return { ok: false, status: 404 }
    const access = await requireTripRole(tx, invite.trip_id, userId, 'owner')
    if (!access.ok) return access
    await tx.query(`UPDATE trip_invites SET revoked_at = $2 WHERE id = $1`, [
      inviteId,
      now,
    ])
    await activity.record(tx, {
      actor: userId,
      trip: invite.trip_id,
      action: 'invite.revoke',
      entityId: invite.id,
      metadata: { code: invite.code },
    })
    return { ok: true }
  })
}

export type InviteFailure =
  | { ok: false; status: 410; reason: 'expired' | 'revoked' }
  | { ok: false; status: 404; reason: 'not_found' }

export type InviteLookup = { ok: true; preview: JoinPreview } | InviteFailure

export async function previewInvite(
  db: Queryable,
  code: string,
  now: Date,
): Promise<InviteLookup> {
  const found = await db.query<{
    trip_id: string
    trip_name: string
    role: string
    revoked_at: Date | null
    expires_at: Date
    owner_name: string | null
    member_count: number
  }>(
    `
    SELECT
      i.trip_id,
      t.name AS trip_name,
      i.role,
      i.revoked_at,
      i.expires_at,
      (
        SELECT COALESCE(u.display_name, u.username)
        FROM trip_members m
        JOIN users u ON u.id = m.user_id
        WHERE m.trip_id = i.trip_id AND m.role = 'owner'
      ) AS owner_name,
      (
        SELECT count(*)::int FROM trip_members m WHERE m.trip_id = i.trip_id
      ) AS member_count
    FROM trip_invites i
    JOIN trips t ON t.id = i.trip_id
    WHERE i.code = $1
    `,
    [code],
  )
  const row = found.rows[0]
  if (!row) return { ok: false, status: 404, reason: 'not_found' }
  if (row.revoked_at) return { ok: false, status: 410, reason: 'revoked' }
  if (row.expires_at.getTime() <= now.getTime()) {
    return { ok: false, status: 410, reason: 'expired' }
  }
  // invites only ever grant planner or visitor
  const parsed = parseTripRole(row.role)
  const role = parsed === 'planner' ? 'planner' : 'visitor'
  return {
    ok: true,
    preview: {
      tripId: row.trip_id,
      tripName: row.trip_name,
      ownerName: row.owner_name ?? '',
      memberCount: row.member_count,
      role,
    },
  }
}

export async function joinTrip(
  pool: Pool,
  userId: string,
  code: string,
  now: Date,
): Promise<{ ok: true; tripId: string } | InviteFailure> {
  return withTransaction(pool, async (tx) => {
    const locked = await tx.query<{
      id: string
      trip_id: string
      role: string
      revoked_at: Date | null
      expires_at: Date
      trip_name: string
    }>(
      `
      SELECT i.id, i.trip_id, i.role, i.revoked_at, i.expires_at, t.name AS trip_name
      FROM trip_invites i
      JOIN trips t ON t.id = i.trip_id
      WHERE i.code = $1
      FOR UPDATE
      `,
      [code],
    )
    const invite = locked.rows[0]
    if (!invite) return { ok: false, status: 404, reason: 'not_found' }
    if (invite.revoked_at) return { ok: false, status: 410, reason: 'revoked' }
    if (invite.expires_at.getTime() <= now.getTime()) {
      return { ok: false, status: 410, reason: 'expired' }
    }
    const inserted = await tx.query(
      `
      INSERT INTO trip_members (trip_id, user_id, role, invited_via)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (trip_id, user_id) DO NOTHING
      `,
      [invite.trip_id, userId, invite.role, invite.id],
    )
    await tx.query(`UPDATE trip_invites SET uses = uses + 1 WHERE id = $1`, [
      invite.id,
    ])
    if ((inserted.rowCount ?? 0) > 0) {
      await activity.record(tx, {
        actor: userId,
        trip: invite.trip_id,
        action: 'member.join',
        entityId: userId,
        metadata: { role: invite.role, code, trip: invite.trip_name },
      })
    }
    return { ok: true, tripId: invite.trip_id }
  })
}

async function readMembers(db: Queryable, tripId: string): Promise<Member[]> {
  const result = await db.query<MemberRow>(
    `
    SELECT
      tm.user_id,
      COALESCE(u.display_name, u.username) AS name,
      u.avatar_url,
      tm.role
    FROM trip_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.trip_id = $1
    ORDER BY
      CASE tm.role WHEN 'owner' THEN 0 WHEN 'planner' THEN 1 ELSE 2 END,
      tm.joined_at,
      tm.user_id
    `,
    [tripId],
  )
  return result.rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    role: roleOrVisitor(row.role),
  }))
}

function mapInvite(row: InviteRow): TripInvite {
  // invites only ever grant planner or visitor
  const parsed = parseTripRole(row.role)
  const role = parsed === 'planner' ? 'planner' : 'visitor'
  return {
    id: row.id,
    code: row.code,
    role,
    expiresAt: row.expires_at.toISOString(),
    uses: row.uses,
  }
}

function transferFirst(): MemberFailure {
  return {
    ok: false,
    status: 409,
    message: 'transfer ownership first',
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}
