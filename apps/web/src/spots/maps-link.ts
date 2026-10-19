/**
 * Step 38 (R-38-11): the link that opens a spot in Google Maps. It opens the
 * Maps app on phones when it is installed and the website everywhere else.
 * Coordinates are rounded to 6 decimals and always use `.` as separator.
 */
export function googleMapsUrl({ lat, lng }: { lat: number; lng: number }) {
  return `https://www.google.com/maps/search/?api=1&query=${coordinate(lat)},${coordinate(lng)}`
}

function coordinate(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6
  return String(Object.is(rounded, -0) ? 0 : rounded)
}
