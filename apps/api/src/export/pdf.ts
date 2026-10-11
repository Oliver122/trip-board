import { spotFiltersActive, type PlanEntry, type Spot } from '@tripboard/shared'
import PDFDocumentFactory from 'pdfkit'
import { exportLabels, formatExportDate, type ExportLocale } from './labels.js'
import type { ExportData } from './store.js'

type DaySpot = { spot: Spot; time: string | null }

type DayBlock = { entry: PlanEntry; spots: DaySpot[] }

type PdfDoc = PDFKit.PDFDocument

export function renderPdf(data: ExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const Factory = PDFDocumentFactory as unknown as new (
      options: PDFKit.PDFDocumentOptions,
    ) => PdfDoc
    const doc = new Factory({
      size: 'A4',
      margin: 48,
      info: { Title: pdfSafe(data.trip.name) },
    })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    writePdf(doc, data)
    doc.end()
  })
}

function writePdf(doc: PdfDoc, data: ExportData): void {
  const labels = exportLabels(data.locale)
  doc.font('Helvetica-Bold').fontSize(18).text(pdfSafe(data.trip.name))
  doc.moveDown(0.3)
  doc.font('Helvetica').fontSize(11)
  const dates = dateLine(data, data.locale)
  if (dates) doc.text(dates)
  if (data.members.length > 0) {
    doc.text(
      data.members
        .map(
          (member) => `${pdfSafe(member.name)} (${labels.role[member.role]})`,
        )
        .join(', '),
    )
  }

  const days = itineraryDays(data)
  if (days.length > 0) {
    doc.moveDown(0.8)
    doc.font('Helvetica-Bold').fontSize(14).text(labels.schedule)
    for (const day of days) {
      doc.moveDown(0.5)
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(formatExportDate(day.date, data.locale))
      for (const block of day.blocks) writeBlock(doc, block, labels.home)
    }
  }

  const planned = new Set(data.visits.map((visit) => visit.spotId))
  const unscheduled = data.spots.filter((spot) => !planned.has(spot.id))
  if (unscheduled.length === 0) return
  doc.moveDown(0.8)
  doc.font('Helvetica-Bold').fontSize(14).text(labels.unscheduled)
  // A spot with two kinds is listed once, under its primary kind (the first).
  const groups: { title: string; spots: Spot[] }[] = data.kinds.map((kind) => ({
    title: labels.kind(kind),
    spots: unscheduled.filter(
      (spot) =>
        spot.displayCategory === 'kind' && spot.kinds[0]?.id === kind.id,
    ),
  }))
  groups.push(
    {
      title: labels.category.planned,
      spots: unscheduled.filter((spot) => spot.displayCategory === 'planned'),
    },
    {
      title: labels.category.home,
      spots: unscheduled.filter((spot) => spot.displayCategory === 'home'),
    },
  )
  for (const group of groups) {
    if (group.spots.length === 0) continue
    doc.moveDown(0.4)
    doc.font('Helvetica-Bold').fontSize(12).text(pdfSafe(group.title))
    for (const spot of group.spots) writeSpot(doc, spot, null)
  }
}

function writeBlock(doc: PdfDoc, block: DayBlock, homeLabel: string): void {
  doc.moveDown(0.3)
  doc.font('Helvetica-Bold').fontSize(11).text(pdfSafe(block.entry.title))
  doc.font('Helvetica').fontSize(10)
  if (block.entry.type === 'single' && block.entry.startTime) {
    doc.text(block.entry.startTime)
  }
  if (block.entry.home) {
    doc.text(`${homeLabel}: ${pdfSafe(block.entry.home.title)}`)
  }
  if (block.entry.info) doc.text(pdfSafe(block.entry.info))
  for (const item of block.spots) writeSpot(doc, item.spot, item.time)
}

function writeSpot(doc: PdfDoc, spot: Spot, time: string | null): void {
  doc.moveDown(0.2)
  doc.font('Helvetica-Bold').fontSize(11).text(pdfSafe(spot.title))
  doc.font('Helvetica').fontSize(10)
  if (time) doc.text(time)
  if (spot.address) doc.text(pdfSafe(spot.address))
  if (spot.info) doc.text(pdfSafe(spot.info))
}

function dateLine(data: ExportData, locale: ExportLocale): string | null {
  if (!data.trip.startDate) return null
  const start = formatExportDate(data.trip.startDate, locale)
  if (!data.trip.endDate) return start
  return `${start} - ${formatExportDate(data.trip.endDate, locale)}`
}

function itineraryDays(
  data: ExportData,
): { date: string; blocks: DayBlock[] }[] {
  const filtersOn = spotFiltersActive(data.filters)
  const spots = new Map(data.spots.map((spot) => [spot.id, spot]))
  const byDay = new Map<string, DayBlock[]>()
  for (const entry of data.entries) {
    if (data.filters.entry && entry.id !== data.filters.entry) continue
    const links = entry.spots.filter((link) => spots.has(link.spotId))
    if (filtersOn && links.length === 0) continue
    const start = entry.startDate
    const end = entry.endDate ?? start
    for (const date of eachDate(start, end)) {
      const dayLinks = links.filter(
        (link) => (link.visitDate ?? start) === date,
      )
      if (filtersOn && dayLinks.length === 0) continue
      const blocks = byDay.get(date) ?? []
      blocks.push({
        entry,
        spots: dayLinks.map((link) => ({
          spot: spots.get(link.spotId)!,
          time: link.visitTime,
        })),
      })
      byDay.set(date, blocks)
    }
  }
  return [...byDay.keys()]
    .sort()
    .map((date) => ({ date, blocks: byDay.get(date) ?? [] }))
}

function eachDate(start: string, end: string): string[] {
  const days: string[] = []
  let cursor = start
  while (cursor <= end && days.length < 3660) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return days
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  date.setUTCDate(date.getUTCDate() + days)
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0')
  const nextDay = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${nextMonth}-${nextDay}`
}

/** Helvetica is a WinAnsi font. Keep Latin-1 and map the rest. */
export function pdfSafe(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (char === '\n') {
      out += '\n'
      continue
    }
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      out += char
      continue
    }
    out += punctuation[char] ?? '?'
  }
  return out
}

const punctuation: Record<string, string> = {
  '\u2013': '-',
  '\u2014': '-',
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2026': '...',
  '\u2022': '*',
  '\u00a0': ' ',
}
