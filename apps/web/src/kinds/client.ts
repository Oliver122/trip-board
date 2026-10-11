import {
  kindListSchema,
  spotKindSchema,
  type CreateKindBody,
  type PatchKindBody,
  type SpotKind,
} from '@tripboard/shared'
import { request, requestJson } from '../api/http'

export async function listKinds(
  tripId: string,
  signal?: AbortSignal,
): Promise<SpotKind[]> {
  const body = await requestJson(`/api/trips/${tripId}/kinds`, kindListSchema, {
    signal,
  })
  return body.kinds
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
