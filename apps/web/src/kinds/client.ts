import {
  kindLimitRequestSchema,
  kindListSchema,
  latestKindLimitRequestSchema,
  spotKindSchema,
  type CreateKindBody,
  type KindLimitRequest,
  type KindLimitRequestCreate,
  type KindList,
  type KindPreset,
  type PatchKindBody,
  type SpotKind,
} from '@tripboard/shared'
import { request, requestJson } from '../api/http'

export async function listKinds(
  tripId: string,
  signal?: AbortSignal,
): Promise<KindList> {
  return requestJson(`/api/trips/${tripId}/kinds`, kindListSchema, { signal })
}

export async function createPresetKind(
  tripId: string,
  preset: KindPreset,
): Promise<SpotKind> {
  return createKind(tripId, { preset })
}

/** The trip's newest kind limit request, or null when there is none. */
export async function latestKindRequest(
  tripId: string,
): Promise<KindLimitRequest | null> {
  const body = await requestJson(
    `/api/trips/${tripId}/kind-limit-requests/latest`,
    latestKindLimitRequestSchema,
  )
  return body.request
}

export async function createKindRequest(
  tripId: string,
  body: KindLimitRequestCreate,
): Promise<KindLimitRequest> {
  return requestJson(
    `/api/trips/${tripId}/kind-limit-requests`,
    kindLimitRequestSchema,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

export async function createKind(
  tripId: string,
  body: CreateKindBody,
): Promise<SpotKind> {
  return requestJson(`/api/trips/${tripId}/kinds`, spotKindSchema, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateKind(
  tripId: string,
  kindId: string,
  body: PatchKindBody,
): Promise<SpotKind> {
  return requestJson(`/api/trips/${tripId}/kinds/${kindId}`, spotKindSchema, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function reorderKinds(
  tripId: string,
  ids: string[],
): Promise<SpotKind[]> {
  const body = await requestJson(
    `/api/trips/${tripId}/kinds/order`,
    kindListSchema,
    { method: 'PUT', body: JSON.stringify({ ids }) },
  )
  return body.kinds
}

export async function deleteKind(
  tripId: string,
  kindId: string,
  moveTo?: string,
): Promise<void> {
  const search = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''
  await request(`/api/trips/${tripId}/kinds/${kindId}${search}`, {
    method: 'DELETE',
  })
}
