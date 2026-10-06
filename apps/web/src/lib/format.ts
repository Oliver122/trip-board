import type { AppLocale } from './locale'

const intlLocale: Record<AppLocale, string> = {
  en: 'en-GB',
  de: 'de-DE',
}

const dateOptions: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
}

const timeOptions: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
}

/** Calendar date. Pass the active locale. Date-only strings stay on that day. */
export function formatDate(input: Date | string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], dateOptions).format(
    toDate(input),
  )
}

/** Clock time in the active locale. */
export function formatTime(input: Date | string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], timeOptions).format(
    toDate(input),
  )
}

function toDate(input: Date | string): Date {
  if (input instanceof Date) return input
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (!match) return new Date(input)
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  )
}
