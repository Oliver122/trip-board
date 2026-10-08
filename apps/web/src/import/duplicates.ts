const duplicateRadiusMeters = 200
const earthRadiusMeters = 6_371_000

export type DuplicateCandidate = {
  title: string
  link: string | null
  lat: number | null
  lng: number | null
}

function toRad(value: number): number {
  return (value * Math.PI) / 180
}

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(h)))
}

function sameSpot(a: DuplicateCandidate, b: DuplicateCandidate): boolean {
  if (a.link && b.link && a.link === b.link) return true
  const sameTitle =
    a.title.trim().toLowerCase() === b.title.trim().toLowerCase()
  if (!sameTitle) return false
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
    return false
  }
  return (
    distanceMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) <=
    duplicateRadiusMeters
  )
}

/**
 * Flags each row that matches an existing trip spot, or an earlier row in
 * the same file, by link or by title within 200 m (R-23-11).
 */
export function markDuplicates<T extends DuplicateCandidate>(
  rows: readonly T[],
  existing: readonly DuplicateCandidate[],
): boolean[] {
  const seen: DuplicateCandidate[] = [...existing]
  return rows.map((row) => {
    const duplicate = seen.some((other) => sameSpot(row, other))
    seen.push(row)
    return duplicate
  })
}
