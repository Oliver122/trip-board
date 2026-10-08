const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

/** "3 minutes ago", "yesterday"; older than a week falls back to the date. */
export function relativeTime(
  iso: string,
  locale: string,
  now: number = Date.now(),
): string {
  const at = new Date(iso).getTime()
  const diff = at - now
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(diff) >= 7 * 86_400_000) {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
      new Date(iso),
    )
  }
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) {
      return format.format(Math.round(diff / ms), unit)
    }
  }
  return format.format(0, 'second')
}

export function fullDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}
