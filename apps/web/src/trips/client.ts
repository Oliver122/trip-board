import {
  tripListSchema,
  tripSchema,
  type CreateTripBody,
  type PatchTripBody,
  type Trip,
} from '@tripboard/shared'

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
): Promise<Trip> {
  const response = await send(`/api/trips/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.status === 400) throw new ApiError(await readFields(response))
  if (response.status === 404) throw new NotFoundError()
  if (!response.ok) throw new ApiError({})
  return tripSchema.parse(await response.json())
}

export async function deleteTrip(id: string): Promise<void> {
  const response = await send(`/api/trips/${id}`, { method: 'DELETE' })
  if (response.status === 404) throw new NotFoundError()
  if (!response.ok) throw new ApiError({})
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, { ...init, credentials: 'include' })
  if (response.status === 401) throw new AuthError()
  return response
}

async function readFields(response: Response): Promise<Record<string, string>> {
  try {
    const body = (await response.json()) as { fields?: Record<string, string> }
    return body.fields ?? {}
  } catch {
    return {}
  }
}
