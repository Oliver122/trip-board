import type { PlanEntry, PlanLink } from './plans.js'

/** Day colours cycle through this many palette slots (R-46-01, R-46-08). */
export const dayColorCount = 8

export type PlanStop = {
  linkId: string
  entryId: string
  spotId: string
  title: string
  visitTime: string | null
  /** 1-based position inside its day. */
  stopNumber: number
}

export type PlanDay = {
  /** `YYYY-MM-DD` */
  date: string
  /** 1-based day of the trip (from the trip start, else the first dated visit). */
  dayNumber: number
  /** 0..7, `(dayNumber - 1) mod 8`. */
  colorIndex: number
  stops: PlanStop[]
}

export type PlanDays = {
  days: PlanDay[]
  /** Undated visits per entry id, in `sort_order`. Entries without any are absent. */
  anyDay: Record<string, PlanLink[]>
}

type Candidate = {
  link: PlanLink
  entry: PlanEntry
  entryIndex: number
}

/**
 * The plan as days (R-46-01). Computed, never stored: `visit_date` stays the
 * only source. Inside a day timed visits come first in time order, then the
 * untimed ones in `sort_order`; ties go by the entry's start.
 */
export function planDays(
  entries: PlanEntry[],
  options: { tripStart?: string | null } = {},
): PlanDays {
  const byDate = new Map<string, Candidate[]>()
  const anyDay: Record<string, PlanLink[]> = {}
  entries.forEach((entry, entryIndex) => {
    for (const link of entry.spots) {
      if (!link.visitDate) {
        ;(anyDay[entry.id] ??= []).push(link)
        continue
      }
      const list = byDate.get(link.visitDate) ?? []
      list.push({ link, entry, entryIndex })
      byDate.set(link.visitDate, list)
    }
  })
  for (const list of Object.values(anyDay)) {
    list.sort((a, b) => a.sortOrder - b.sortOrder)
  }
  const dates = [...byDate.keys()].sort()
  const origin = options.tripStart ?? dates[0] ?? null
  const days = dates.map((date): PlanDay => {
    const candidates = byDate.get(date) ?? []
    candidates.sort(compareStops)
    const dayNumber = origin ? daysBetween(origin, date) + 1 : 1
    return {
      date,
      dayNumber,
      colorIndex: colorIndexFor(dayNumber),
      stops: candidates.map(({ link, entry }, index) => ({
        linkId: link.id,
        entryId: entry.id,
        spotId: link.spotId,
        title: link.title,
        visitTime: link.visitTime,
        stopNumber: index + 1,
      })),
    }
  })
  return { days, anyDay }
}

/** `(dayNumber - 1) mod 8`, also for days before the trip start. */
export function colorIndexFor(dayNumber: number): number {
  const index = (dayNumber - 1) % dayColorCount
  return index < 0 ? index + dayColorCount : index
}

function compareStops(a: Candidate, b: Candidate): number {
  const timeA = a.link.visitTime
  const timeB = b.link.visitTime
  if (timeA && !timeB) return -1
  if (!timeA && timeB) return 1
  if (timeA && timeB && timeA !== timeB) return timeA < timeB ? -1 : 1
  if (!timeA && !timeB && a.link.sortOrder !== b.link.sortOrder) {
    return a.link.sortOrder - b.link.sortOrder
  }
  const startA = `${a.entry.startDate} ${a.entry.startTime ?? ''}`
  const startB = `${b.entry.startDate} ${b.entry.startTime ?? ''}`
  if (startA !== startB) return startA < startB ? -1 : 1
  if (a.entryIndex !== b.entryIndex) return a.entryIndex - b.entryIndex
  return a.link.sortOrder - b.link.sortOrder
}

function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

function utc(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}
