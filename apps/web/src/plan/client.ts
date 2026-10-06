import {
  planEntrySchema,
  planEntryUpdateSchema,
  planLinkSchema,
  planListSchema,
  type PlanEntry,
  type PlanEntryUpdate,
  type PlanLink,
} from '@tripboard/shared'
import { AuthError } from '../trips/client'

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
): Promise<PlanEntryUpdate> {
  const response = await send(`/api/plan/${entryId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
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

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, { ...init, credentials: 'include' })
  if (response.status === 401) throw new AuthError()
  return response
}
