import {
  placeLinkLimits,
  type BBox,
  type GeocodeLang,
  type GeocodePlace,
  type PlaceFromLink,
} from '@tripboard/shared'
import type { GeocodeService } from '../geocode/store.js'

export const matchRadiusMeters = 300

export type LinkInput = {
  /** The link as the user gave it. */
  link: string
  lat: number | null
  lng: number | null
  name: string | null
  addressHint: string | null
}

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

function inBox(place: GeocodePlace, bbox: BBox): boolean {
  return (
    place.lat >= bbox.minLat &&
    place.lat <= bbox.maxLat &&
    place.lng >= bbox.minLng &&
    place.lng <= bbox.maxLng
  )
}

/** R-33-04: match the link to a Nominatim point, else fall back to its own. */
export async function locatePlace(
  input: LinkInput,
  geocode: GeocodeService,
  bbox: BBox,
  lang: GeocodeLang,
): Promise<PlaceFromLink> {
  const point =
    input.lat !== null && input.lng !== null
      ? { lat: input.lat, lng: input.lng }
      : null
  const queries = input.name
    ? [
        ...(input.addressHint ? [`${input.name}, ${input.addressHint}`] : []),
        input.name,
      ]
    : []

  let found: { lat: number; lng: number; address: string | null } | null = null
  let geocoderDown = false
  for (const q of queries) {
    try {
      const { results } = await geocode.search({ q, lang, bbox })
      const hit = point
        ? results.find((r) => distanceMeters(point, r) <= matchRadiusMeters)
        : results.find((r) => inBox(r, bbox))
      if (hit) {
        found = { lat: hit.lat, lng: hit.lng, address: hit.label }
        break
      }
    } catch {
      geocoderDown = true
      break
    }
  }

  if (!found && point) {
    let address: string | null = null
    if (!geocoderDown) {
      try {
        address = (await geocode.reverse({ ...point, lang })).label
      } catch {
        address = null
      }
    }
    found = { ...point, address }
  }

  const title = input.name ? input.name.slice(0, placeLinkLimits.title) : null
  return {
    title,
    address: found?.address ?? null,
    lat: found?.lat ?? null,
    lng: found?.lng ?? null,
    link: linkFor(input, found),
    placed: found !== null,
  }
}

function linkFor(
  input: LinkInput,
  found: { lat: number; lng: number } | null,
): string {
  if (input.link.length <= placeLinkLimits.link) return input.link
  const query = found
    ? `${found.lat},${found.lng}`
    : encodeURIComponent(input.name ?? '')
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}
