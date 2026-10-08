import type { ParseResult } from './model.js'
import { hasTitle, overRowLimit, shapeRow } from './model.js'

type JsonRecord = Record<string, unknown>

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function pick(properties: JsonRecord): {
  title: string
  address: string | null
  link: string | null
} {
  const location =
    properties.Location && typeof properties.Location === 'object'
      ? (properties.Location as JsonRecord)
      : {}
  const title =
    str(properties.Title) ||
    str(location['Business Name']) ||
    str(properties.name)
  const address = str(location.Address) || null
  const link = str(properties['Google Maps URL']) || null
  return { title, address, link }
}

function pointCoords(geometry: unknown): { lat: number; lng: number } | null {
  if (
    !geometry ||
    typeof geometry !== 'object' ||
    (geometry as JsonRecord).type !== 'Point'
  ) {
    return null
  }
  const coordinates = (geometry as JsonRecord).coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const [lng, lat] = coordinates
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

/** Parses the Takeout "Saved Places.json" GeoJSON export (R-23-04). */
export function parseGeoJson(source: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(source)
  } catch {
    return { ok: false, error: 'unreadable' }
  }
  const features =
    data &&
    typeof data === 'object' &&
    Array.isArray((data as JsonRecord).features)
      ? ((data as JsonRecord).features as unknown[])
      : null
  if (!features) return { ok: false, error: 'unreadable' }

  const points = features.filter(
    (feature) =>
      feature &&
      typeof feature === 'object' &&
      (feature as JsonRecord).type === 'Feature' &&
      (feature as JsonRecord).geometry &&
      ((feature as JsonRecord).geometry as JsonRecord).type === 'Point',
  ) as JsonRecord[]

  if (overRowLimit(points.length)) {
    return { ok: false, error: 'too_many_rows' }
  }

  let skipped = 0
  const rows = points.flatMap((feature) => {
    const properties =
      feature.properties && typeof feature.properties === 'object'
        ? (feature.properties as JsonRecord)
        : {}
    const picked = pick(properties)
    if (!hasTitle(picked)) {
      skipped += 1
      return []
    }
    const coords = pointCoords(feature.geometry)
    return [
      shapeRow(
        { title: picked.title, address: picked.address, url: picked.link },
        coords,
      ),
    ]
  })

  return { ok: true, source: 'google_geojson', rows, skipped }
}
