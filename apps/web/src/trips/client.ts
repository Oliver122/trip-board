import {
  tripListSchema,
  tripSchema,
  type CreateTripBody,
  type PatchTripBody,
  type Trip,
} from '@tripboard/shared'
import { writeInit } from '../api/write'

export class AuthError extends Error {
  constructor() {
    super('unauthenticated')
    this.name = 'AuthError'
  }
}

export class NotFoundError extends Error {
  constructor() {
    super('not_found')
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  readonly current: Trip
  readonly updatedBy: { id: string; name: string } | null

  constructor(current: Trip, updatedBy: { id: string; name: string } | null) {
    super('conflict')
    this.name = 'ConflictError'
    this.current = current
    this.updatedBy = updatedBy
  }
}

export class ApiError extends Error {
  fields: Record<string, string>

  constructor(fields: Record<string, string>) {
    super('invalid_request')
    this.name = 'ApiError'
    this.fields = fields
  }
}

export async function listTrips(signal?: AbortSignal): Promise<Trip[]> {
  const response = await send('/api/trips', { signal })
  if (!response.ok) throw new ApiError({})
  return tripListSchema.parse(await response.json()).trips
}

export async function getTrip(id: string, signal?: AbortSignal): Promise<Trip> {
  const response = await send(`/api/trips/${id}`, { signal })
  if (response.status === 404 || response.status === 400)
    throw new NotFoundError()
  if (!response.ok) throw new ApiError({})
  return tripSchema.parse(await response.json())
}

export async function createTrip(body: CreateTripBody): Promise<Trip> {
  const response = await send('/api/trips', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.status === 400) throw new ApiError(await readFields(response))
  if (!response.ok) throw new ApiError({})
  return tripSchema.parse(await response.json())
}

export async function updateTrip(
  id: string,
  body: PatchTripBody,
  expectedUpdatedAt?: string,
): Promise<Trip> {
  const response = await send(`/api/trips/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      expectedUpdatedAt ? { ...body, expectedUpdatedAt } : body,
    ),
  })
  if (response.status === 400) throw new ApiError(await readFields(response))
  if (response.status === 404) throw new NotFoundError()
  if (response.status === 409) throw await conflictError(response)
  if (!response.ok) throw new ApiError({})
  return tripSchema.parse(await response.json())
}

export async function deleteTrip(id: string): Promise<void> {
  const response = await send(`/api/trips/${id}`, { method: 'DELETE' })
  if (response.status === 404) throw new NotFoundError()
  if (!response.ok) throw new ApiError({})
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, {
    ...writeInit(init),
    credentials: 'include',
  })
  if (response.status === 401) throw new AuthError()
  return response
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
  return new ConflictError(tripSchema.parse(body.current), updatedBy)
}

async function readFields(response: Response): Promise<Record<string, string>> {
  try {
    const body = (await response.json()) as { fields?: Record<string, string> }
    return body.fields ?? {}
  } catch {
    return {}
  }
}
