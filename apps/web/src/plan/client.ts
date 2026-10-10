import {
  planEntrySchema,
  planEntryUpdateSchema,
  planLinkSchema,
  planListSchema,
  type PlanEntry,
  type PlanEntryUpdate,
  type PlanLink,
} from '@tripboard/shared'
import { request, requestJson } from '../api/http'

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
  const list = await requestJson(`/api/trips/${tripId}/plan`, planListSchema, {
    signal,
  })
  return list.entries
}

export async function createPlanEntry(
  tripId: string,
  body: PlanWrite,
): Promise<PlanEntry> {
  return requestJson(`/api/trips/${tripId}/plan`, planEntrySchema, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updatePlanEntry(
  entryId: string,
  body: PlanWrite,
  expectedUpdatedAt?: string,
): Promise<PlanEntryUpdate> {
  return requestJson(`/api/plan/${entryId}`, planEntryUpdateSchema, {
    method: 'PATCH',
    body: JSON.stringify(
      expectedUpdatedAt ? { ...body, expectedUpdatedAt } : body,
    ),
  })
}

export async function deletePlanEntry(entryId: string): Promise<void> {
  await request(`/api/plan/${entryId}`, { method: 'DELETE' })
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
  return requestJson(`/api/plan/${entryId}/spots`, planLinkSchema, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function removePlanSpot(
  entryId: string,
  linkId: string,
): Promise<void> {
  await request(`/api/plan/${entryId}/spots/${linkId}`, { method: 'DELETE' })
}

export async function reorderPlanSpots(
  entryId: string,
  linkIds: string[],
): Promise<PlanEntry> {
  return requestJson(`/api/plan/${entryId}/spots/order`, planEntrySchema, {
    method: 'PUT',
    body: JSON.stringify({ linkIds }),
  })
}
