import {
  planEntrySchema,
  planEntryUpdateSchema,
  planLinkSchema,
  planListSchema,
  type PlanEntry,
  type PlanEntryUpdate,
  type PlanLink,
} from '@tripboard/shared'
import { writeInit } from '../api/write'
import { AuthError } from '../trips/client'

export class ConflictError extends Error {
  readonly current: PlanEntry
  readonly updatedBy: { id: string; name: string } | null

  constructor(
    current: PlanEntry,
    updatedBy: { id: string; name: string } | null,
  ) {
    super('conflict')
    this.name = 'ConflictError'
    this.current = current
    this.updatedBy = updatedBy
  }
}

export type PlanWrite = {
  type?: 'bucket' | 'single'
  title: string
  date?: string
  startDate: string
  endDate: string | null
  startTime: string | null
  endTime: string | null
  info: string | null
}

export async function listPlan(
  tripId: string,
  signal?: AbortSignal,
): Promise<PlanEntry[]> {
  const response = await send(`/api/trips/${tripId}/plan`, { signal })
  if (!response.ok) throw new Error('load')
  return planListSchema.parse(await response.json()).entries
}

export async function createPlanEntry(
  tripId: string,
  body: PlanWrite,
): Promise<PlanEntry> {
  const response = await send(`/api/trips/${tripId}/plan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('save')
  return planEntrySchema.parse(await response.json())
}

export async function updatePlanEntry(
  entryId: string,
  body: PlanWrite,
  expectedUpdatedAt?: string,
): Promise<PlanEntryUpdate> {
  const response = await send(`/api/plan/${entryId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      expectedUpdatedAt ? { ...body, expectedUpdatedAt } : body,
    ),
  })
  if (response.status === 409) throw await conflictError(response)
  if (!response.ok) throw new Error('save')
  return planEntryUpdateSchema.parse(await response.json())
}

export async function deletePlanEntry(entryId: string): Promise<void> {
  const response = await send(`/api/plan/${entryId}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('save')
}

export async function addPlanSpot(
  entryId: string,
  body: {
    spotId: string
    visitDate?: string | null
    visitTime?: string | null
    info?: string | null
  },
): Promise<PlanLink> {
  const response = await send(`/api/plan/${entryId}/spots`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('save')
  return planLinkSchema.parse(await response.json())
}

export async function removePlanSpot(
  entryId: string,
  linkId: string,
): Promise<void> {
  const response = await send(`/api/plan/${entryId}/spots/${linkId}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('save')
}

export async function reorderPlanSpots(
  entryId: string,
  linkIds: string[],
): Promise<PlanEntry> {
  const response = await send(`/api/plan/${entryId}/spots/order`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ linkIds }),
  })
  if (!response.ok) throw new Error('save')
  return planEntrySchema.parse(await response.json())
}

async function conflictError(response: Response): Promise<ConflictError> {
  const body = (await response.json()) as {
    current?: unknown
    updatedBy?: { id?: unknown; name?: unknown } | null
  }
  const updatedBy =
    body.updatedBy &&
    typeof body.updatedBy.id === 'string' &&
    typeof body.updatedBy.name === 'string'
      ? { id: body.updatedBy.id, name: body.updatedBy.name }
      : null
  return new ConflictError(planEntrySchema.parse(body.current), updatedBy)
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, {
    ...writeInit(init),
    credentials: 'include',
  })
  if (response.status === 401) throw new AuthError()
  return response
}
