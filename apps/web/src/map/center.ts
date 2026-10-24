type CenterWindow = Window & {
  __tripboardMap?: { getCenter: () => { lng: number; lat: number } }
}

/** The centre of the shared trip map, or null while it is not loaded. */
export function mapCenter(): { lng: number; lat: number } | null {
  const center = (window as CenterWindow).__tripboardMap?.getCenter()
  return center ? { lng: center.lng, lat: center.lat } : null
}
