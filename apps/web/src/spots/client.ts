import {
  geocodePlaceSchema,
  geocodeSearchSchema,
  spotDetailSchema,
  spotListSchema,
  spotListSearchParams,
  spotSchema,
  type CreateSpotBody,
  type GeocodeLang,
  type GeocodePlace,
  type PatchSpotBody,
  type Spot,
  type SpotDetail,
  type SpotListQuery,
} from '@tripboard/shared'
import { AuthError } from '../trips/client'

export class SaveError extends Error {
  readonly status: number
  readonly fields: Record<string, string>

  constructor(status: number, fields: Record<string, string>) {
    super('save')
    this.name = 'SaveError'
    this.status = status
    this.fields = fields
  }
}

export async function listSpots(
  tripId: string,
  query: SpotListQuery,
  signal?: AbortSignal,
): Promise<{ spots: Spot[]; total: number }> {
  const params = spotListSearchParams(query)
  params.delete('visible')
  const search = params.toString()
  const path = search
    ? `/api/trips/${tripId}/spots?${search}`
    : `/api/trips/${tripId}/spots`
  const response = await send(path, { signal })
  if (!response.ok) throw new Error('load')
  const body = spotListSchema.parse(await response.json())
  return { spots: body.spots, total: body.total }
}

export async function createSpot(
  tripId: string,
  body: CreateSpotBody,
): Promise<Spot> {
  const response = await send(`/api/trips/${tripId}/spots`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await saveError(response)
  return spotSchema.parse(await response.json())
}

export async function updateSpot(
  spotId: string,
  body: PatchSpotBody,
): Promise<Spot> {
  const response = await send(`/api/spots/${spotId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await saveError(response)
  return spotSchema.parse(await response.json())
}

export async function getSpot(
  spotId: string,
  signal?: AbortSignal,
): Promise<SpotDetail> {
  const response = await send(`/api/spots/${spotId}`, { signal })
  if (!response.ok) throw new Error('load')
  return spotDetailSchema.parse(await response.json())
}

export async function deleteSpot(spotId: string): Promise<void> {
  const response = await send(`/api/spots/${spotId}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('save')
}

export async function searchAddress(
  query: string,
  lang: GeocodeLang,
  tripId: string,
  signal?: AbortSignal,
): Promise<GeocodePlace[]> {
  const params = new URLSearchParams({ q: query, lang, tripId })
  const response = await send(`/api/geocode/search?${params}`, { signal })
  if (!response.ok) return []
  return geocodeSearchSchema.parse(await response.json()).results
}

export async function reverseAddress(
  lat: number,
  lng: number,
  lang: GeocodeLang,
  signal?: AbortSignal,
): Promise<GeocodePlace | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    lang,
  })
  const response = await send(`/api/geocode/reverse?${params}`, { signal })
  if (!response.ok) return null
  return geocodePlaceSchema.parse(await response.json())
}

async function saveError(response: Response): Promise<SaveError> {
  let fields: Record<string, string> = {}
  try {
    const body = (await response.json()) as { fields?: unknown }
    if (body.fields && typeof body.fields === 'object') {
      fields = Object.fromEntries(
        Object.entries(body.fields).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    }
  } catch {
    /* empty body */
  }
  return new SaveError(response.status, fields)
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, { ...init, credentials: 'include' })
  if (response.status === 401) throw new AuthError()
  return response
}
