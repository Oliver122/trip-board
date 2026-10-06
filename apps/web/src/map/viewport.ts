export type Viewport = {
  lng: number
  lat: number
  zoom: number
}

const hashPattern = /^#(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/

/** `#zoom/lat/lng`, stable enough that a reload restores the same view. */
export function formatViewportHash(view: Viewport): string {
  return `#${view.zoom.toFixed(2)}/${view.lat.toFixed(5)}/${view.lng.toFixed(5)}`
}

export function parseViewportHash(hash: string): Viewport | null {
  const match = hashPattern.exec(hash)
  if (!match) return null
  const zoom = Number(match[1])
  const lat = Number(match[2])
  const lng = Number(match[3])
  if (zoom < 0 || zoom > 22) return null
  if (lat < -90 || lat > 90) return null
  if (lng < -180 || lng > 180) return null
  return { lng, lat, zoom }
}
