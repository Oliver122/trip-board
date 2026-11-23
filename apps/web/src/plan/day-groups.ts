import type { PlanDays, PlanEntry, PlanLink } from '@tripboard/shared'

export type DayRow = {
  link: PlanLink
  /** Position inside its day on the whole plan, as the map numbers it. */
  stopNumber: number | null
}

/** One sub-group of an open bucket: a day with visits, or *Any day* (R-46-02). */
export type DayGroup = {
  /** `YYYY-MM-DD`, or null for *Any day*. */
  date: string | null
  colorIndex: number
  rows: DayRow[]
}

/** Every date of an entry's range, a single is just its date. */
export function entryDates(entry: PlanEntry): string[] {
  if (entry.type === 'single' || !entry.endDate) return [entry.startDate]
  const dates: string[] = []
  const [year, month, day] = entry.startDate.split('-').map(Number)
  let time = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)
  const last = entry.endDate
  while (dates.length < 400) {
    const date = new Date(time).toISOString().slice(0, 10)
    if (date > last) break
    dates.push(date)
    time += 86_400_000
  }
  return dates
}

/** The entry's visits as day groups: days with visits in date order, then *Any day*. */
export function dayGroups(entry: PlanEntry, planned: PlanDays): DayGroup[] {
  const byId = new Map(entry.spots.map((link) => [link.id, link]))
  const groups: DayGroup[] = []
  for (const day of planned.days) {
    const rows = day.stops.flatMap((stop): DayRow[] => {
      const link = stop.entryId === entry.id ? byId.get(stop.linkId) : undefined
      return link ? [{ link, stopNumber: stop.stopNumber }] : []
    })
    if (rows.length > 0) {
      groups.push({ date: day.date, colorIndex: day.colorIndex, rows })
    }
  }
  const any = planned.anyDay[entry.id] ?? []
  if (any.length > 0) {
    groups.push({
      date: null,
      colorIndex: 0,
      rows: any.map((link) => ({ link, stopNumber: null })),
    })
  }
  return groups
}

/** Only visits without a time can be reordered by hand (R-46-02). */
export function untimedIds(group: DayGroup): string[] {
  return group.rows.filter((row) => !row.link.visitTime).map((r) => r.link.id)
}

/**
 * The entry's full `linkIds` order after the group's untimed visits took
 * `next`: every other row keeps its place.
 */
export function mergeGroupOrder(
  entry: PlanEntry,
  groupIds: string[],
  next: string[],
): string[] {
  const inGroup = new Set(groupIds)
  let cursor = 0
  return entry.spots.map((link) =>
    inGroup.has(link.id) ? (next[cursor++] ?? link.id) : link.id,
  )
}

/**
 * The plan after a visit moved (R-46-03): another entry puts it last there,
 * the same entry keeps the order; the time stays only when a day is set.
 */
export function moveLink(
  entries: PlanEntry[],
  fromEntryId: string,
  linkId: string,
  toEntryId: string,
  visitDate: string | null,
): PlanEntry[] {
  const source = entries.find((entry) => entry.id === fromEntryId)
  const link = source?.spots.find((item) => item.id === linkId)
  if (!source || !link) return entries
  const moved: PlanLink = {
    ...link,
    visitDate,
    visitTime: visitDate ? link.visitTime : null,
  }
  return entries.map((entry) => {
    if (fromEntryId === toEntryId && entry.id === fromEntryId) {
      return {
        ...entry,
        spots: entry.spots.map((item) => (item.id === linkId ? moved : item)),
      }
    }
    if (entry.id === fromEntryId) {
      return { ...entry, spots: entry.spots.filter((i) => i.id !== linkId) }
    }
    if (entry.id === toEntryId) {
      const last = entry.spots.reduce(
        (max, i) => Math.max(max, i.sortOrder),
        -1,
      )
      return {
        ...entry,
        spots: [...entry.spots, { ...moved, sortOrder: last + 1 }],
      }
    }
    return entry
  })
}
