import type { BBox } from './trips.js'

export type KnownRegion = {
  label: string
  timezone: string
  bbox: BBox
}

/** Enough for the create-trip dialog. Step 06 replaces this with Nominatim. */
export const knownRegions: readonly KnownRegion[] = [
  {
    label: 'Japan',
    timezone: 'Asia/Tokyo',
    bbox: { minLng: 122.94, minLat: 24.4, maxLng: 145.82, maxLat: 45.55 },
  },
  {
    label: 'Germany',
    timezone: 'Europe/Berlin',
    bbox: { minLng: 5.87, minLat: 47.27, maxLng: 15.04, maxLat: 55.06 },
  },
  {
    label: 'France',
    timezone: 'Europe/Paris',
    bbox: { minLng: -5.14, minLat: 41.33, maxLng: 9.56, maxLat: 51.09 },
  },
  {
    label: 'Italy',
    timezone: 'Europe/Rome',
    bbox: { minLng: 6.63, minLat: 35.49, maxLng: 18.52, maxLat: 47.09 },
  },
  {
    label: 'Spain',
    timezone: 'Europe/Madrid',
    bbox: { minLng: -9.39, minLat: 35.95, maxLng: 3.39, maxLat: 43.79 },
  },
  {
    label: 'United Kingdom',
    timezone: 'Europe/London',
    bbox: { minLng: -8.65, minLat: 49.86, maxLng: 1.76, maxLat: 60.86 },
  },
  {
    label: 'United States',
    timezone: 'America/New_York',
    bbox: { minLng: -125, minLat: 24.4, maxLng: -66.9, maxLat: 49.4 },
  },
  {
    label: 'Canada',
    timezone: 'America/Toronto',
    bbox: { minLng: -141, minLat: 41.7, maxLng: -52.6, maxLat: 83.1 },
  },
  {
    label: 'Thailand',
    timezone: 'Asia/Bangkok',
    bbox: { minLng: 97.3, minLat: 5.6, maxLng: 105.6, maxLat: 20.5 },
  },
  {
    label: 'Australia',
    timezone: 'Australia/Sydney',
    bbox: { minLng: 112.9, minLat: -43.6, maxLng: 153.6, maxLat: -10.7 },
  },
  {
    label: 'South Korea',
    timezone: 'Asia/Seoul',
    bbox: { minLng: 124.6, minLat: 33.1, maxLng: 131.9, maxLat: 38.6 },
  },
  {
    label: 'Taiwan',
    timezone: 'Asia/Taipei',
    bbox: { minLng: 119.3, minLat: 21.9, maxLng: 122, maxLat: 25.3 },
  },
]

export function searchRegions(query: string): KnownRegion[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return knownRegions
    .filter((region) => region.label.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStart = a.label.toLowerCase().startsWith(q) ? 0 : 1
      const bStart = b.label.toLowerCase().startsWith(q) ? 0 : 1
      return aStart - bStart || a.label.localeCompare(b.label)
    })
    .slice(0, 8)
}
