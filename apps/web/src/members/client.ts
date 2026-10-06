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
  type TripInvite,
} from '@tripboard/shared'
import { writeInit } from '../api/write'
import { AuthError } from '../trips/client'

export class MembersError extends Error {
  status: number

  constructor(status: number) {
    super('members')
    this.name = 'MembersError'
    this.status = status
  }
}

export async function listMembers(
  tripId: string,
  signal?: AbortSignal,
): Promise<Member[]> {
  const response = await send(`/api/trips/${tripId}/members`, { signal })
  if (!response.ok) throw new MembersError(response.status)
  return memberListSchema.parse(await response.json()).members
}

export async function updateMemberRole(
  tripId: string,
  userId: string,
  role: InviteRole,
): Promise<Member> {
  const response = await send(`/api/trips/${tripId}/members/${userId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  if (!response.ok) throw new MembersError(response.status)
  return memberSchema.parse(await response.json())
}

export async function removeMember(
  tripId: string,
  userId: string,
): Promise<void> {
  const response = await send(`/api/trips/${tripId}/members/${userId}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new MembersError(response.status)
}

export async function leaveTrip(tripId: string): Promise<void> {
  const response = await send(`/api/trips/${tripId}/leave`, { method: 'POST' })
  if (!response.ok) throw new MembersError(response.status)
}

export async function transferOwnership(
  tripId: string,
  userId: string,
): Promise<Member[]> {
  const response = await send(`/api/trips/${tripId}/transfer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  if (!response.ok) throw new MembersError(response.status)
  return memberListSchema.parse(await response.json()).members
}

export async function listInvites(
  tripId: string,
  signal?: AbortSignal,
): Promise<TripInvite[]> {
  const response = await send(`/api/trips/${tripId}/invites`, { signal })
  if (!response.ok) throw new MembersError(response.status)
  return inviteListSchema.parse(await response.json()).invites
}

export async function createInvite(
  tripId: string,
  role: InviteRole,
): Promise<TripInvite> {
  const response = await send(`/api/trips/${tripId}/invites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  if (!response.ok) throw new MembersError(response.status)
  return inviteSchema.parse(await response.json())
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const response = await send(`/api/invites/${inviteId}`, { method: 'DELETE' })
  if (!response.ok) throw new MembersError(response.status)
}

export async function previewJoin(
  code: string,
  signal?: AbortSignal,
): Promise<JoinPreview> {
  const response = await fetch(`/api/join/${encodeURIComponent(code)}`, {
    signal,
  })
  if (response.status === 410) throw new MembersError(410)
  if (response.status === 404 || response.status === 400) {
    throw new MembersError(response.status)
  }
  if (!response.ok) throw new MembersError(response.status)
  return joinPreviewSchema.parse(await response.json())
}

export async function acceptJoin(code: string): Promise<string> {
  const response = await send(`/api/join/${encodeURIComponent(code)}`, {
    method: 'POST',
  })
  if (!response.ok) throw new MembersError(response.status)
  return joinResultSchema.parse(await response.json()).tripId
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/join/${code}`
}

export function daysUntil(expiresAt: string, now = Date.now()): number {
  const remaining = new Date(expiresAt).getTime() - now
  return Math.max(1, Math.ceil(remaining / 86_400_000))
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, {
    ...writeInit(init),
    credentials: 'include',
  })
  if (response.status === 401) throw new AuthError()
  return response
}
