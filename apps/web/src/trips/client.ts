import {
  tripListSchema,
  tripSchema,
  type CreateTripBody,
  type PatchTripBody,
  type Trip,
} from '@tripboard/shared'
import { ApiError, request, requestJson } from '../api/http'

export async function listTrips(signal?: AbortSignal): Promise<Trip[]> {
  const list = await requestJson('/api/trips', tripListSchema, { signal })
  return list.trips
}

export async function getTrip(id: string, signal?: AbortSignal): Promise<Trip> {
  try {
    return await requestJson(`/api/trips/${id}`, tripSchema, { signal })
  } catch (error) {
    // a malformed id is as good as a missing trip
    if (error instanceof ApiError && error.status === 400) {
      throw new ApiError(404, error.body)
    }
    throw error
  }
}

export async function createTrip(body: CreateTripBody): Promise<Trip> {
  return requestJson('/api/trips', tripSchema, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateTrip(
  id: string,
  body: PatchTripBody,
  expectedUpdatedAt?: string,
): Promise<Trip> {
  return requestJson(`/api/trips/${id}`, tripSchema, {
    method: 'PATCH',
    body: JSON.stringify(
      expectedUpdatedAt ? { ...body, expectedUpdatedAt } : body,
    ),
  })
}

export async function deleteTrip(id: string): Promise<void> {
  await request(`/api/trips/${id}`, { method: 'DELETE' })
}
