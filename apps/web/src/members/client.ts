import {
  inviteListSchema,
  inviteSchema,
  joinPreviewSchema,
  joinResultSchema,
  memberListSchema,
  memberSchema,
  type InviteRole,
  type JoinPreview,
  type Member,
  type MemberRole,
  type TripInvite,
} from '@tripboard/shared'
import { request, requestJson } from '../api/http'

export async function listMembers(
  tripId: string,
  signal?: AbortSignal,
): Promise<Member[]> {
  const list = await requestJson(
    `/api/trips/${tripId}/members`,
    memberListSchema,
    { signal },
  )
  return list.members
}

export async function updateMemberRole(
  tripId: string,
  userId: string,
  role: MemberRole,
): Promise<Member> {
  return requestJson(`/api/trips/${tripId}/members/${userId}`, memberSchema, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
}

export async function removeMember(
  tripId: string,
  userId: string,
): Promise<void> {
  await request(`/api/trips/${tripId}/members/${userId}`, { method: 'DELETE' })
}

export async function leaveTrip(tripId: string): Promise<void> {
  await request(`/api/trips/${tripId}/leave`, { method: 'POST' })
}

export async function transferOwnership(
  tripId: string,
  userId: string,
): Promise<Member[]> {
  const list = await requestJson(
    `/api/trips/${tripId}/transfer`,
    memberListSchema,
    { method: 'POST', body: JSON.stringify({ userId }) },
  )
  return list.members
}

export async function listInvites(
  tripId: string,
  signal?: AbortSignal,
): Promise<TripInvite[]> {
  const list = await requestJson(
    `/api/trips/${tripId}/invites`,
    inviteListSchema,
    { signal },
  )
  return list.invites
}

export async function createInvite(
  tripId: string,
  role: InviteRole,
): Promise<TripInvite> {
  return requestJson(`/api/trips/${tripId}/invites`, inviteSchema, {
    method: 'POST',
    body: JSON.stringify({ role }),
  })
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await request(`/api/invites/${inviteId}`, { method: 'DELETE' })
}

export async function previewJoin(
  code: string,
  signal?: AbortSignal,
): Promise<JoinPreview> {
  return requestJson(
    `/api/join/${encodeURIComponent(code)}`,
    joinPreviewSchema,
    { signal },
  )
}

export async function acceptJoin(code: string): Promise<string> {
  const result = await requestJson(
    `/api/join/${encodeURIComponent(code)}`,
    joinResultSchema,
    { method: 'POST' },
  )
  return result.tripId
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/join/${code}`
}

export function daysUntil(expiresAt: string, now = Date.now()): number {
  const remaining = new Date(expiresAt).getTime() - now
  return Math.max(1, Math.ceil(remaining / 86_400_000))
}
