export function tripFileSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug.slice(0, 80) : 'trip'
}

export function fileDate(now: Date, timeZone: string): string {
  const zone = validZone(timeZone)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00'
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

export function exportFilename(
  name: string,
  now: Date,
  timeZone: string,
  extension: string,
): string {
  return `${tripFileSlug(name)}-${fileDate(now, timeZone)}.${extension}`
}

export function validZone(timeZone: string): string {
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return timeZone
  } catch {
    return 'UTC'
  }
}
