import type { AppLocale } from '../lib/locale'

const intlLocale = { en: 'en-GB', de: 'de-DE' } as const

export function formatBytes(bytes: number, locale: AppLocale): string {
  const format = new Intl.NumberFormat(intlLocale[locale], {
    maximumFractionDigits: 1,
  })
  const gb = bytes / (1024 * 1024 * 1024)
  if (Math.abs(gb) >= 1) return `${format.format(gb)} GB`
  return `${format.format(bytes / (1024 * 1024))} MB`
}

export function formatCount(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(intlLocale[locale]).format(value)
}

export function signedBytes(bytes: number, locale: AppLocale): string {
  const text = formatBytes(Math.abs(bytes), locale)
  if (bytes > 0) return `+${text}`
  if (bytes < 0) return `−${text}`
  return text
}
