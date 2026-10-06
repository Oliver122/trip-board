import type { Spot } from '@tripboard/shared'
import { exportLabels } from './labels.js'
import type { ExportData, ExportVisit } from './store.js'

const formulaStart = /^[=+\-@]/

/** Prefix formula triggers so Excel treats the cell as text. */
export function csvField(value: string): string {
  const safe = formulaStart.test(value) ? `'${value}` : value
  if (/[",\r\n]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`
  return safe
}

export function renderCsv(data: ExportData): string {
  const labels = exportLabels(data.locale)
  const visits = groupVisits(data.visits)
  const lines = [labels.headers.map(csvField).join(',')]
  for (const spot of data.spots) {
    const rows = visits.get(spot.id)
    if (!rows || rows.length === 0) lines.push(spotLine(spot, null, labels))
    else for (const visit of rows) lines.push(spotLine(spot, visit, labels))
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

function spotLine(
  spot: Spot,
  visit: ExportVisit | null,
  labels: ReturnType<typeof exportLabels>,
): string {
  return [
    spot.title,
    labels.category[spot.displayCategory],
    spot.address ?? '',
    coordinate(spot.lat),
    coordinate(spot.lng),
    spot.info ?? '',
    spot.link ?? '',
    visit?.entryTitle ?? '',
    visit ? labels.entryType[visit.entryType] : '',
    visit?.visitDate ?? '',
    visit?.visitTime ?? '',
    spot.createdBy?.name ?? '',
  ]
    .map(csvField)
    .join(',')
}

function coordinate(value: number): string {
  return Number.isFinite(value) ? String(value) : ''
}

function groupVisits(visits: ExportVisit[]): Map<string, ExportVisit[]> {
  const grouped = new Map<string, ExportVisit[]>()
  for (const visit of visits) {
    const list = grouped.get(visit.spotId)
    if (list) list.push(visit)
    else grouped.set(visit.spotId, [visit])
  }
  return grouped
}
