export type LocateCandidate = {
  title: string
  address: string | null
  lat: number | null
  lng: number | null
}

export type LocationStatus = 'file' | 'found' | 'not_found'

export type Located<T> = T & {
  lat: number | null
  lng: number | null
  locationStatus: LocationStatus
  foundLabel: string | null
}

export type GeocodeSearch = (
  query: string,
  signal: AbortSignal,
) => Promise<{ lat: number; lng: number; label: string } | null>

/**
 * Looks up coordinates for rows that did not carry them, one request at a
 * time, in order, stopping as soon as the signal is aborted (R-23-09).
 */
export async function locateRows<T extends LocateCandidate>(
  rows: readonly T[],
  search: GeocodeSearch,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<Located<T>[]> {
  const total = rows.filter((row) => row.lat == null || row.lng == null).length
  const results: Located<T>[] = []
  let done = 0
  for (const row of rows) {
    if (row.lat != null && row.lng != null) {
      results.push({ ...row, locationStatus: 'file', foundLabel: null })
      continue
    }
    if (signal.aborted) {
      results.push({ ...row, locationStatus: 'not_found', foundLabel: null })
      continue
    }
    const query = [row.title, row.address].filter(Boolean).join(', ')
    const found = await search(query, signal)
    done += 1
    onProgress(done, total)
    if (found) {
      results.push({
        ...row,
        lat: found.lat,
        lng: found.lng,
        locationStatus: 'found',
        foundLabel: found.label,
      })
    } else {
      results.push({ ...row, locationStatus: 'not_found', foundLabel: null })
    }
  }
  return results
}
