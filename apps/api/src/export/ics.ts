import { spotFiltersActive, type PlanEntry, type Spot } from '@tripboard/shared'
import { validZone } from './names.js'
import type { ExportData, ExportVisit } from './store.js'

export function renderIcs(data: ExportData): string {
  const zone = icsZone(data.trip.timezone)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trip Board//Trip Board//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    textProp('X-WR-CALNAME', data.trip.name),
    `X-WR-TIMEZONE:${zone}`,
    ...timezoneBlock(zone, data.exportedAt),
    ...events(data, zone),
    'END:VCALENDAR',
  ]
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

function events(data: ExportData, zone: string): string[] {
  const filtersOn = spotFiltersActive(data.filters)
  const spots = new Map(data.spots.map((spot) => [spot.id, spot]))
  const lines: string[] = []
  for (const entry of data.entries) {
    if (data.filters.entry && entry.id !== data.filters.entry) continue
    const linked = entry.spots.some((spot) => spots.has(spot.spotId))
    if (filtersOn && !linked) continue
    lines.push(...entryEvent(data, entry, zone))
  }
  for (const visit of data.visits) {
    if (!visit.visitDate || !visit.visitTime) continue
    const spot = spots.get(visit.spotId)
    if (!spot) continue
    lines.push(...visitEvent(data, visit, spot, zone))
  }
  return lines
}

function entryEvent(
  data: ExportData,
  entry: PlanEntry,
  zone: string,
): string[] {
  const home = entry.home ? data.homes.get(entry.home.spotId) : undefined
  const lines = [
    'BEGIN:VEVENT',
    textProp('UID', `plan-${entry.id}@tripboard`),
    `DTSTAMP:${stamp(data.exportedAt)}`,
    textProp('SUMMARY', entry.title),
  ]
  if (entry.type === 'single' && entry.startTime) {
    const end = entry.endTime
      ? { date: entry.startDate, time: entry.endTime }
      : addMinutes(entry.startDate, entry.startTime, 60)
    lines.push(
      `DTSTART;TZID=${zone}:${localStamp(entry.startDate, entry.startTime)}`,
    )
    lines.push(`DTEND;TZID=${zone}:${localStamp(end.date, end.time)}`)
  } else {
    const end = addDays(entry.endDate ?? entry.startDate, 1)
    lines.push(`DTSTART;VALUE=DATE:${compactDate(entry.startDate)}`)
    lines.push(`DTEND;VALUE=DATE:${compactDate(end)}`)
  }
  if (entry.info) lines.push(textProp('DESCRIPTION', entry.info))
  if (home?.address) lines.push(textProp('LOCATION', home.address))
  if (home) lines.push(`GEO:${home.lat};${home.lng}`)
  lines.push('END:VEVENT')
  return lines
}

function visitEvent(
  data: ExportData,
  visit: ExportVisit,
  spot: Spot,
  zone: string,
): string[] {
  const end = addMinutes(visit.visitDate!, visit.visitTime!, 60)
  const lines = [
    'BEGIN:VEVENT',
    textProp('UID', `visit-${visit.id}@tripboard`),
    `DTSTAMP:${stamp(data.exportedAt)}`,
    textProp('SUMMARY', spot.title),
    `DTSTART;TZID=${zone}:${localStamp(visit.visitDate!, visit.visitTime!)}`,
    `DTEND;TZID=${zone}:${localStamp(end.date, end.time)}`,
  ]
  if (spot.info) lines.push(textProp('DESCRIPTION', spot.info))
  if (spot.address) lines.push(textProp('LOCATION', spot.address))
  lines.push(`GEO:${spot.lat};${spot.lng}`)
  lines.push('END:VEVENT')
  return lines
}

function timezoneBlock(zone: string, now: Date): string[] {
  const offset = zoneOffset(zone, now)
  return [
    'BEGIN:VTIMEZONE',
    `TZID:${zone}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:${offset}`,
    `TZOFFSETTO:${offset}`,
    `TZNAME:${zone}`,
    'END:STANDARD',
    'END:VTIMEZONE',
  ]
}

function icsZone(timeZone: string): string {
  const zone = validZone(timeZone)
  return /^[A-Za-z0-9_+/.-]+$/.test(zone) ? zone : 'UTC'
}

function zoneOffset(timeZone: string, date: Date): string {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: validZone(timeZone),
    timeZoneName: 'longOffset',
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value
  if (!name || name === 'GMT') return '+0000'
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name)
  if (!match) return '+0000'
  return `${match[1]}${match[2]!.padStart(2, '0')}${match[3] ?? '00'}`
}

function textProp(name: string, value: string): string {
  return `${name}:${escapeText(value)}`
}

function escapeText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\n', '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
}

function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let index = 0
  let width = 75
  while (index < bytes.length) {
    let end = Math.min(bytes.length, index + width)
    while (end > index && (bytes[end]! & 0xc0) === 0x80) end -= 1
    if (end === index) end = Math.min(bytes.length, index + width)
    parts.push(bytes.subarray(index, end).toString('utf8'))
    index = end
    width = 74
  }
  return parts
    .map((part, partIndex) => (partIndex === 0 ? part : ` ${part}`))
    .join('\r\n')
}

function stamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

function compactDate(iso: string): string {
  return iso.replaceAll('-', '')
}

function localStamp(date: string, time: string): string {
  return `${compactDate(date)}T${time.replace(':', '')}00`
}

function addDays(iso: string, days: number): string {
  return addMinutes(iso, '00:00', days * 24 * 60).date
}

function addMinutes(
  date: string,
  time: string,
  minutes: number,
): { date: string; time: string } {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const utc = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!))
  utc.setUTCMinutes(utc.getUTCMinutes() + minutes)
  const nextYear = utc.getUTCFullYear()
  const nextMonth = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const nextDay = String(utc.getUTCDate()).padStart(2, '0')
  const nextHour = String(utc.getUTCHours()).padStart(2, '0')
  const nextMinute = String(utc.getUTCMinutes()).padStart(2, '0')
  return {
    date: `${nextYear}-${nextMonth}-${nextDay}`,
    time: `${nextHour}:${nextMinute}`,
  }
}
