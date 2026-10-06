const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/

export function dateAllowed(
  date: string,
  start: string,
  end: string | null,
): boolean {
  if (!isoDate.test(date) || !isoDate.test(start)) return false
  const last = end && isoDate.test(end) ? end : start
  return date >= start && date <= last
}

/** Visit dates that fall outside a bucket after its range changes. */
export function clearedVisitCount(
  visits: { visitDate: string | null }[],
  start: string,
  end: string | null,
): number {
  if (!isoDate.test(start)) return 0
  if (end != null && !isoDate.test(end)) return 0
  const last = end ?? start
  return visits.filter((visit) => {
    if (!visit.visitDate) return false
    return visit.visitDate < start || visit.visitDate > last
  }).length
}

/** First of each month from `start` through `end`, inclusive. */
export function monthsCovering(start: string, end: string | null): string[] {
  if (!isoDate.test(start)) return []
  const last = end && isoDate.test(end) ? end : start
  const from = start <= last ? start : last
  const to = start <= last ? last : start
  const months: string[] = []
  let year = Number(from.slice(0, 4))
  let month = Number(from.slice(5, 7))
  const endYear = Number(to.slice(0, 4))
  const endMonth = Number(to.slice(5, 7))
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}-01`)
    month += 1
    if (month === 13) {
      month = 1
      year += 1
    }
    if (months.length > 36) break
  }
  return months
}

export function daysInMonth(monthStart: string): string[] {
  const match = isoDate.exec(monthStart)
  if (!match) return []
  const year = Number(match[1])
  const month = Number(match[2])
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const days: string[] = []
  for (let day = 1; day <= count; day += 1) {
    days.push(`${match[1]}-${match[2]}-${String(day).padStart(2, '0')}`)
  }
  return days
}
