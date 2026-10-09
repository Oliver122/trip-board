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
import { isAuth, request, requestJson } from '../api/http'

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
  const body = await requestJson(path, spotListSchema, { signal })
  return { spots: body.spots, total: body.total }
}

export async function createSpot(
  tripId: string,
  body: CreateSpotBody,
): Promise<Spot> {
  return requestJson(`/api/trips/${tripId}/spots`, spotSchema, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateSpot(
  spotId: string,
  body: PatchSpotBody,
  expectedUpdatedAt?: string,
): Promise<Spot> {
  return requestJson(`/api/spots/${spotId}`, spotSchema, {
    method: 'PATCH',
    body: JSON.stringify(
      expectedUpdatedAt ? { ...body, expectedUpdatedAt } : body,
    ),
  })
}

export async function getSpot(
  spotId: string,
  signal?: AbortSignal,
): Promise<SpotDetail> {
  return requestJson(`/api/spots/${spotId}`, spotDetailSchema, { signal })
}

export async function deleteSpot(spotId: string): Promise<void> {
  await request(`/api/spots/${spotId}`, { method: 'DELETE' })
}

export async function searchAddress(
  query: string,
  lang: GeocodeLang,
  tripId: string,
  signal?: AbortSignal,
): Promise<GeocodePlace[]> {
  const params = new URLSearchParams({ q: query, lang, tripId })
  try {
    const body = await requestJson(
      `/api/geocode/search?${params}`,
      geocodeSearchSchema,
      { signal },
    )
    return body.results
  } catch (error) {
    if (
      isAuth(error) ||
      (error instanceof DOMException && error.name === 'AbortError')
    )
      throw error
    return []
  }
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
  try {
    return await requestJson(
      `/api/geocode/reverse?${params}`,
      geocodePlaceSchema,
      { signal },
    )
  } catch (error) {
    if (
      isAuth(error) ||
      (error instanceof DOMException && error.name === 'AbortError')
    )
      throw error
    return null
  }
}
