import type { PlanMapDay, PlanMapStop } from '../trips/trip-context'

type LineCollection = {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    properties: { date: string }
    geometry: { type: 'LineString'; coordinates: [number, number][] }
  }[]
}

/** The dashed line of one day: its stops joined in order (R-46-05). */
export function dayLine(day: PlanMapDay): LineCollection {
  const coordinates = day.stops.map((stop): [number, number] => [
    stop.lng,
    stop.lat,
  ])
  return {
    type: 'FeatureCollection',
    features:
      coordinates.length < 2
        ? []
        : [
            {
              type: 'Feature',
              properties: { date: day.date },
              geometry: { type: 'LineString', coordinates },
            },
          ],
  }
}

/** Mean position of a day's stops, where its card is anchored (R-46-06). */
export function dayCentroid(stops: readonly PlanMapStop[]): {
  lng: number
  lat: number
} {
  if (stops.length === 0) return { lng: 0, lat: 0 }
  let lng = 0
  let lat = 0
  for (const stop of stops) {
    lng += stop.lng
    lat += stop.lat
  }
  return { lng: lng / stops.length, lat: lat / stops.length }
}

/** The box around a day's stops, for the day-focus fit (R-46-07). */
export function dayBounds(stops: readonly PlanMapStop[]) {
  if (stops.length === 0) return null
  return {
    minLng: Math.min(...stops.map((stop) => stop.lng)),
    minLat: Math.min(...stops.map((stop) => stop.lat)),
    maxLng: Math.max(...stops.map((stop) => stop.lng)),
    maxLat: Math.max(...stops.map((stop) => stop.lat)),
  }
}

const stackRadius = 12

/**
 * Pixel offsets so stops on identical coordinates (a spot visited twice,
 * or two spots at one address) stay clickable: they sit on a small circle
 * around the shared point; a lone stop has no offset (R-46-05).
 */
export function stopOffsets(
  days: readonly PlanMapDay[],
): Map<string, [number, number]> {
  const groups = new Map<string, string[]>()
  for (const day of days) {
    for (const stop of day.stops) {
      const key = `${stop.lng.toFixed(6)},${stop.lat.toFixed(6)}`
      const list = groups.get(key) ?? []
      list.push(stop.linkId)
      groups.set(key, list)
    }
  }
  const offsets = new Map<string, [number, number]>()
  for (const ids of groups.values()) {
    ids.forEach((id, index) => {
      if (ids.length === 1) {
        offsets.set(id, [0, 0])
        return
      }
      const angle = (index / ids.length) * Math.PI * 2 - Math.PI / 2
      offsets.set(id, [
        Math.round(Math.cos(angle) * stackRadius),
        Math.round(Math.sin(angle) * stackRadius),
      ])
    })
  }
  return offsets
}
