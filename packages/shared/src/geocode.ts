import { z } from 'zod'
import { bboxSchema, type BBox } from './trips.js'

export const geocodeLangs = ['en', 'de'] as const
export const geocodeLangSchema = z.enum(geocodeLangs)
export type GeocodeLang = z.infer<typeof geocodeLangSchema>

export const geocodeQueryLimit = 200

export const geocodePlaceSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  bbox: bboxSchema.optional(),
})

export type GeocodePlace = z.infer<typeof geocodePlaceSchema>

export const geocodeSearchSchema = z.object({
  results: z.array(geocodePlaceSchema),
})

export type GeocodeSearch = z.infer<typeof geocodeSearchSchema>

/** Nominatim viewbox order is left, top, right, bottom. */
export function nominatimViewbox(bbox: BBox): string {
  return `${bbox.minLng},${bbox.maxLat},${bbox.maxLng},${bbox.minLat}`
}

export function searchCacheKey(
  lang: GeocodeLang,
  query: string,
  viewbox?: string,
): string {
  const base = `search:${lang}:${query.trim().toLowerCase()}`
  return viewbox ? `${base}:${viewbox}` : base
}

export function reverseCacheKey(
  lang: GeocodeLang,
  lat: number,
  lng: number,
): string {
  return `reverse:${lang}:${lat.toFixed(4)},${lng.toFixed(4)}`
}
