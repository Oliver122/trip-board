import type { Spot, SpotCategory } from '@tripboard/shared'
import type { Category } from '../components/category'
import type { LngLatBounds } from '../map/bounds'
import { formatDate, formatTime } from '../lib/format'
import type { AppLocale } from '../lib/locale'

export type Draft = {
  title: string
  address: string
  lat: number | null
  lng: number | null
  baseCategory: SpotCategory
  info: string
  link: string
}

export const emptyDraft: Draft = {
  title: '',
  address: '',
  lat: null,
  lng: null,
  baseCategory: 'must_go',
  info: '',
  link: '',
}

export function pinCategory(
  category: Spot['displayCategory'] | SpotCategory,
): Category {
  if (category === 'must_go') return 'must-go'
  return category
}

export function draftFromSpot(spot: Spot): Draft {
  return {
    title: spot.title,
    address: spot.address ?? '',
    lat: spot.lat,
    lng: spot.lng,
    baseCategory: spot.baseCategory,
    info: spot.info ?? '',
    link: spot.link ?? '',
  }
}

export function draftsEqual(left: Draft, right: Draft): boolean {
  return (
    left.title === right.title &&
    left.address === right.address &&
    left.lat === right.lat &&
    left.lng === right.lng &&
    left.baseCategory === right.baseCategory &&
    left.info === right.info &&
    left.link === right.link
  )
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
