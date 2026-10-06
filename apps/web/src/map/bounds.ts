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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
