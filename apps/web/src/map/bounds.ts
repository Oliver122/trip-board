export type LngLatBounds = {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

const WORLD = { minLng: -180, maxLng: 180, minLat: -90, maxLat: 90 }

/** Trip bbox expanded by a 50% margin on every side, clamped to world limits. */
export function maxBoundsFor(bbox: LngLatBounds): LngLatBounds {
  const lngPad = (bbox.maxLng - bbox.minLng) * 0.5
  const latPad = (bbox.maxLat - bbox.minLat) * 0.5
  return {
    minLng: clamp(bbox.minLng - lngPad, WORLD.minLng, WORLD.maxLng),
    minLat: clamp(bbox.minLat - latPad, WORLD.minLat, WORLD.maxLat),
    maxLng: clamp(bbox.maxLng + lngPad, WORLD.minLng, WORLD.maxLng),
    maxLat: clamp(bbox.maxLat + latPad, WORLD.minLat, WORLD.maxLat),
  }
}

/** `[west, south, east, north]` for MapLibre `maxBounds`. */
export function toMaxBoundsTuple(
  bounds: LngLatBounds,
): [number, number, number, number] {
  return [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat]
}

/** Box around spot coordinates. A single point is padded so the map can frame it. */
export function boundsForPoints(
  points: { lat: number; lng: number }[],
): LngLatBounds | null {
  const first = points[0]
  if (!first) return null
  let minLng = first.lng
  let maxLng = first.lng
  let minLat = first.lat
  let maxLat = first.lat
  for (const point of points) {
    minLng = Math.min(minLng, point.lng)
    maxLng = Math.max(maxLng, point.lng)
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
  }
  if (minLng === maxLng) {
    minLng -= 0.05
    maxLng += 0.05
  }
  if (minLat === maxLat) {
    minLat -= 0.05
    maxLat += 0.05
  }
  return { minLng, minLat, maxLng, maxLat }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
