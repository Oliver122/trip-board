import type { AppLocale } from '../lib/locale'

const intlLocale: Record<AppLocale, string> = { en: 'en-GB', de: 'de-DE' }

function wallClock(takenAt: string): Date {
  return new Date(`${takenAt}Z`)
}

/** "10:15": the camera's wall clock, read as UTC so it never shifts. */
export function formatTime(takenAt: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(wallClock(takenAt))
}

/** "Mon 13 Apr, 10:15" for the lightbox. */
export function formatDateTime(takenAt: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(wallClock(takenAt))
}

/** Rounded coordinates, the place line while a name loads or fails. */
export function formatPoint(lat: number, lng: number): string {
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`
}
