export function megabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024))
}

/** “240 kB” or “1.2 MB”, with the decimal separator of the active language. */
export function formatSize(bytes: number, language: string): string {
  const locale = language.startsWith('de') ? 'de-DE' : 'en-GB'
  if (bytes < 1000 * 1000) {
    const kb = Math.max(1, Math.round(bytes / 1000))
    return `${new Intl.NumberFormat(locale).format(kb)} kB`
  }
  const mb = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(bytes / (1000 * 1000))
  return `${mb} MB`
}
