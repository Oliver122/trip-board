// Day pages and place groups of the book (R-47-06, R-47-09). Pure.
import type { Photo } from '@tripboard/shared'

type PlacedPhoto = Photo & { lat: number; lng: number }

export type PlaceGroup = {
  key: string
  spotId: string | null
  spotTitle: string | null
  /** Null for the group of photos that are not placed. */
  lat: number | null
  lng: number | null
  photos: Photo[]
}

export type DayPage = {
  /** `YYYY-MM-DD`, or `none` for photos without a date. */
  key: string
  date: string | null
  places: PlaceGroup[]
  count: number
}

type BookGroups = { days: DayPage[]; notPlaced: Photo[] }

export function isPlaced(photo: Photo): photo is PlacedPhoto {
  return photo.lat !== null && photo.lng !== null
}

/** The rounded point two photos share when they are within about 100 m. */
function placeKey(photo: Photo): string {
  if (photo.spotId) return `spot:${photo.spotId}`
  if (!isPlaced(photo)) return 'unplaced'
  return `pt:${photo.lat.toFixed(3)},${photo.lng.toFixed(3)}`
}

function dateOf(photo: Photo): string | null {
  return photo.takenAt ? photo.takenAt.slice(0, 10) : null
}

/**
 * One page per `takenAt` date in date order, then the undated ones. Every
 * photo is on a page; photos without a point form an `unplaced` group there
 * and are also listed in `notPlaced` for the action list (R-47-09).
 */
export function groupBook(photos: Photo[]): BookGroups {
  const notPlaced: Photo[] = []
  const byDay = new Map<string, Map<string, PlaceGroup>>()
  for (const photo of photos) {
    if (!isPlaced(photo)) notPlaced.push(photo)
    const day = dateOf(photo) ?? 'none'
    const places = byDay.get(day) ?? new Map<string, PlaceGroup>()
    byDay.set(day, places)
    const key = placeKey(photo)
    const group = places.get(key)
    if (group) group.photos.push(photo)
    else {
      places.set(key, {
        key,
        spotId: photo.spotId,
        spotTitle: photo.spotTitle,
        lat: photo.lat,
        lng: photo.lng,
        photos: [photo],
      })
    }
  }
  const keys = [...byDay.keys()].sort((a, b) =>
    a === 'none' ? 1 : b === 'none' ? -1 : a.localeCompare(b),
  )
  const days = keys.map((key) => {
    const places = [...(byDay.get(key) ?? []).values()]
    return {
      key,
      date: key === 'none' ? null : key,
      places,
      count: places.reduce((sum, place) => sum + place.photos.length, 0),
    }
  })
  return { days, notPlaced }
}

/** The server's order: `takenAt` (undated last), then `createdAt`, then id (R-47-03). */
export function sortPhotos(photos: Photo[]): Photo[] {
  return [...photos].sort((a, b) => {
    if (a.takenAt !== b.takenAt) {
      if (a.takenAt === null) return 1
      if (b.takenAt === null) return -1
      return a.takenAt < b.takenAt ? -1 : 1
    }
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}
