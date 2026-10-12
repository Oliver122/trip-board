import {
  kindLimits,
  type PlaceFromLink,
  type Spot,
  type SpotCategory,
  type SpotKind,
  type SpotKindRef,
} from '@tripboard/shared'
import type { QueuedPhoto } from '../images/queue'
import type { LngLatBounds } from '../map/bounds'
import { formatDate, formatTime } from '../lib/format'
import type { AppLocale } from '../lib/locale'

export type Draft = {
  title: string
  address: string
  lat: number | null
  lng: number | null
  baseCategory: SpotCategory
  /** Picked kinds in trip kind order; empty for a home spot. */
  kindIds: string[]
  stayFrom: string
  stayTo: string
  primary: boolean
  info: string
  link: string
  /** Step 34: photos queued in add mode, sent after *Add* (R-34-12). */
  photos: QueuedPhoto[]
  /** Step 33: the draft was filled from a Google Maps link (R-34-12 opens suggestions). */
  fromLink: boolean
}

export const emptyDraft: Draft = {
  title: '',
  address: '',
  lat: null,
  lng: null,
  baseCategory: 'kind',
  kindIds: [],
  stayFrom: '',
  stayTo: '',
  primary: false,
  info: '',
  link: '',
  photos: [],
  fromLink: false,
}

/** A blank draft that starts on the trip's first kind. */
export function newDraft(kinds: readonly Pick<SpotKind, 'id'>[] | null): Draft {
  const first = kinds?.[0]
  return first ? { ...emptyDraft, kindIds: [first.id] } : emptyDraft
}

/** The kinds a draft would save, in trip kind order. */
export function draftKinds<T extends Pick<SpotKindRef, 'id'>>(
  draft: Pick<Draft, 'baseCategory' | 'kindIds'>,
  kinds: readonly T[],
): T[] {
  if (draft.baseCategory === 'home') return []
  return kinds.filter((kind) => draft.kindIds.includes(kind.id))
}

/** Body fields for the picked category: `kindIds` in kind order, or home. */
export function categoryBody(
  draft: Pick<Draft, 'baseCategory' | 'kindIds'>,
  kinds: readonly Pick<SpotKind, 'id'>[],
): { kindIds: string[] } | { category: 'home' } {
  if (draft.baseCategory === 'home') return { category: 'home' }
  const ordered = draftKinds(draft, kinds).map((kind) => kind.id)
  const first = kinds[0]
  const ids = ordered.length > 0 ? ordered : first ? [first.id] : []
  return { kindIds: ids.slice(0, kindLimits.perSpot) }
}

export function draftFromSpot(spot: Spot): Draft {
  return {
    title: spot.title,
    address: spot.address ?? '',
    lat: spot.lat,
    lng: spot.lng,
    baseCategory: spot.baseCategory,
    kindIds: spot.kinds.map((kind) => kind.id),
    stayFrom: spot.stayFrom ?? '',
    stayTo: spot.stayTo ?? '',
    primary: spot.primary,
    info: spot.info ?? '',
    link: spot.link ?? '',
    photos: [],
    fromLink: false,
  }
}

/**
 * A draft filled from a Google Maps link (R-33-07). From the field the typed
 * title stays; an unplaced result leaves the pin as it was.
 */
export function draftWithPlace(
  draft: Draft,
  place: PlaceFromLink,
  keepTitle: boolean,
): Draft {
  const placed = place.placed && place.lat != null && place.lng != null
  return {
    ...draft,
    title:
      keepTitle && draft.title.trim()
        ? draft.title
        : (place.title ?? draft.title),
    address: place.address ?? draft.address,
    link: place.link,
    lat: placed ? place.lat : draft.lat,
    lng: placed ? place.lng : draft.lng,
    fromLink: true,
  }
}

export function draftsEqual(left: Draft, right: Draft): boolean {
  return (
    left.title === right.title &&
    left.address === right.address &&
    left.lat === right.lat &&
    left.lng === right.lng &&
    left.baseCategory === right.baseCategory &&
    left.kindIds.join(',') === right.kindIds.join(',') &&
    left.stayFrom === right.stayFrom &&
    left.stayTo === right.stayTo &&
    left.primary === right.primary &&
    left.info === right.info &&
    left.link === right.link &&
    left.photos.map((photo) => photo.id).join(',') ===
      right.photos.map((photo) => photo.id).join(',')
  )
}

export type SwitchDecision = 'switch' | 'confirm' | 'ignore'

/**
 * What a pin click, card click or right-click add does while a panel is open:
 * wait for a save to finish, ask before dropping edits, or just switch.
 */
export function switchDecision(panel: {
  draft: Draft
  baseline: Draft
  saving: boolean
}): SwitchDecision {
  if (panel.saving) return 'ignore'
  return draftsEqual(panel.draft, panel.baseline) ? 'switch' : 'confirm'
}

/** Puts the primary home base first among home spots that share a schedule state. */
export function orderPrimaryHomes<T extends Spot>(spots: T[]): T[] {
  const next = spots.slice()
  for (const scheduled of [true, false]) {
    const indexes = next.flatMap((spot, index) =>
      spot.displayCategory === 'home' &&
      Boolean(spot.firstScheduledAt) === scheduled
        ? [index]
        : [],
    )
    const homes = indexes.flatMap((index) => {
      const spot = next[index]
      return spot ? [spot] : []
    })
    const primary = homes.find((spot) => spot.primary)
    if (!primary) continue
    const ordered = [primary, ...homes.filter((spot) => spot.id !== primary.id)]
    indexes.forEach((index, offset) => {
      const spot = ordered[offset]
      if (spot) next[index] = spot
    })
  }
  return next
}

export function containsPoint(
  bounds: LngLatBounds,
  point: { lat: number; lng: number },
): boolean {
  return (
    point.lng >= Math.min(bounds.minLng, bounds.maxLng) &&
    point.lng <= Math.max(bounds.minLng, bounds.maxLng) &&
    point.lat >= Math.min(bounds.minLat, bounds.maxLat) &&
    point.lat <= Math.max(bounds.minLat, bounds.maxLat)
  )
}

export function spotsInView<T extends { lat: number; lng: number }>(
  spots: T[],
  bounds: LngLatBounds | null,
  onlyVisible: boolean,
): T[] {
  if (!onlyVisible || !bounds) return spots
  return spots.filter((spot) => containsPoint(bounds, spot))
}

export function listEmptyKind(
  total: number,
  matched: number,
  shown: number,
): 'trip' | 'filters' | 'view' | 'none' {
  if (total === 0) return 'trip'
  if (matched === 0) return 'filters'
  if (shown === 0) return 'view'
  return 'none'
}

export function spotSubtitle(spot: Spot, locale: AppLocale): string {
  if (spot.firstScheduledAt)
    return formatWallClock(spot.firstScheduledAt, locale)
  return spot.address ?? ''
}

/** `spots_view` stores the trip's local date and time with no zone. */
function formatWallClock(value: string, locale: AppLocale): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) return value
  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
    ),
  )
  return `${formatDate(date, locale)} ${formatTime(date, locale)}`
}

/** Spots per filter token: each kind id, `planned` and `home`. */
export function categoryCounts(
  spots: readonly Pick<Spot, 'kinds' | 'baseCategory' | 'displayCategory'>[],
): Record<string, number> {
  const counts: Record<string, number> = { planned: 0, home: 0 }
  for (const spot of spots) {
    for (const kind of spot.kinds) counts[kind.id] = (counts[kind.id] ?? 0) + 1
    if (spot.displayCategory === 'planned') counts.planned! += 1
    if (spot.baseCategory === 'home') counts.home! += 1
  }
  return counts
}

/** The toolbar label of the selected categories: "Food", or "Food +3" past `limit`. */
export function collapseLabels(
  labels: readonly string[],
  limit: number,
): { first: string; more: number } | null {
  const [first] = labels
  if (first == null || labels.length <= limit) return null
  return { first, more: labels.length - 1 }
}
