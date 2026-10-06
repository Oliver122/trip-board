export type Viewport = {
  lng: number
  lat: number
  zoom: number
}

export type ViewportScope = 'board' | 'schedule'

const number = String.raw`-?\d+(?:\.\d+)?`
const boardPattern = new RegExp(`^#(${number})/(${number})/(${number})$`)
const schedulePattern = new RegExp(`^#s/(${number})/(${number})/(${number})$`)

/**
 * The board and the schedule used to share one `#zoom/lat/lng` hash. Tab links
 * keep the hash, and the map reads it as the first camera, so the schedule
 * opened on the board's last view. A `moveend` while the old map was still
 * mounted could also write that hash onto the new URL.
 *
 * The board keeps `#zoom/lat/lng` (reload, R-05-09) plus a sessionStorage copy,
 * because the schedule replaces the hash. The schedule uses `#s/zoom/lat/lng`
 * only, and ignores every other hash so a fresh visit fits the trip.
 *
 * One map instance now outlives both pages. A `moveend` is tagged with the
 * page that started the gesture. Writing it after a tab switch would store
 * the old camera under the new page's hash, so mismatched scopes write nothing.
 */
export const viewportTransitionMs = 500

/** Animated tab changes use ~500 ms. Reduced motion jumps in the same frame. */
export function viewportTransitionDuration(reducedMotion: boolean): number {
  return reducedMotion ? 0 : viewportTransitionMs
}

export function rememberViewport(input: {
  eventScope: ViewportScope
  activeScope: ViewportScope
  view: Viewport
  pathname: string
  search: string
}): {
  view: Viewport
  hash: string
  url: string
  persistBoard: boolean
} | null {
  if (input.eventScope !== input.activeScope) return null
  const view = roundViewport(input.view)
  const hash = formatViewportHash(view, input.activeScope)
  return {
    view,
    hash,
    url: `${input.pathname}${input.search}${hash}`,
    persistBoard: input.activeScope === 'board',
  }
}

export function formatViewportHash(
  view: Viewport,
  scope: ViewportScope = 'board',
): string {
  const rounded = roundViewport(view)
  const body = `${rounded.zoom.toFixed(2)}/${rounded.lat.toFixed(5)}/${rounded.lng.toFixed(5)}`
  return scope === 'schedule' ? `#s/${body}` : `#${body}`
}

export function parseViewportHash(
  hash: string,
  scope: ViewportScope = 'board',
): Viewport | null {
  const match = (scope === 'schedule' ? schedulePattern : boardPattern).exec(
    hash,
  )
  if (!match) return null
  return viewportFrom(Number(match[1]), Number(match[2]), Number(match[3]))
}

export function viewportStorageKey(scope: ViewportScope, tripId: string) {
  return `tripboard:viewport:${scope}:${tripId}`
}

export function readStoredViewport(key: string): Viewport | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Viewport>
    if (
      typeof parsed.zoom !== 'number' ||
      typeof parsed.lat !== 'number' ||
      typeof parsed.lng !== 'number'
    ) {
      return null
    }
    return viewportFrom(parsed.zoom, parsed.lat, parsed.lng)
  } catch {
    return null
  }
}

export function writeStoredViewport(key: string, view: Viewport) {
  try {
    sessionStorage.setItem(key, JSON.stringify(roundViewport(view)))
  } catch {
    /* private mode */
  }
}

/**
 * Board hash wins on reload. A schedule hash (`#s/…`) means we just left the
 * schedule, so the board view comes from sessionStorage. Any other hash fits
 * the trip instead of replaying the board.
 */
export function initialViewport(
  hash: string,
  scope: ViewportScope,
  stored: Viewport | null,
): Viewport | null {
  const fromHash = parseViewportHash(hash, scope)
  if (fromHash) return fromHash
  if (scope === 'board' && hash.startsWith('#s/')) return stored
  return null
}

export function roundViewport(view: Viewport): Viewport {
  return {
    zoom: Number(view.zoom.toFixed(2)),
    lat: Number(view.lat.toFixed(5)),
    lng: Number(view.lng.toFixed(5)),
  }
}

function viewportFrom(zoom: number, lat: number, lng: number): Viewport | null {
  if (zoom < 0 || zoom > 22) return null
  if (lat < -90 || lat > 90) return null
  if (lng < -180 || lng > 180) return null
  return { lng, lat, zoom }
}
