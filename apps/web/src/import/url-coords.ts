const num = '-?\\d+(?:\\.\\d+)?'

const patterns = [
  new RegExp(`!3d(${num})!4d(${num})`),
  new RegExp(`@(${num}),(${num})`),
  new RegExp(`/search/(${num}),(${num})`),
  new RegExp(`[?&]q=(${num}),(${num})`),
]

function inRange(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

/**
 * Reads lat/lng from a Google Maps URL, trying each pattern in order
 * (R-23-06). A pattern that matches but is out of range still counts as
 * that pattern's answer: it does not fall through to a weaker pattern
 * matching the same coordinates elsewhere in the URL.
 */
export function coordsFromGoogleMapsUrl(
  url: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!url) return null
  for (const pattern of patterns) {
    const match = pattern.exec(url)
    if (!match) continue
    const lat = Number(match[1])
    const lng = Number(match[2])
    if (inRange(lat, lng)) return { lat, lng }
    return null
  }
  return null
}
