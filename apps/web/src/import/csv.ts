import type { ParseResult } from './model.js'
import { hasTitle, overRowLimit, shapeRow } from './model.js'
import { coordsFromGoogleMapsUrl } from './url-coords.js'

const knownHeaders = ['title', 'note', 'url', 'address', 'comment'] as const
type KnownHeader = (typeof knownHeaders)[number]

function tokenize(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const len = text.length
  while (i < len) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }
    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (char === '\r') {
      i += 1
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }
    field += char
    i += 1
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Parses a Google Takeout list CSV (R-23-03). */
export function parseCsv(text: string): ParseResult {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows = tokenize(withoutBom)
  const header = rows[0]
  if (!header) return { ok: false, error: 'no_title_column' }
  const index: Partial<Record<KnownHeader, number>> = {}
  header.forEach((cell, position) => {
    const name = cell.trim().toLowerCase()
    if ((knownHeaders as readonly string[]).includes(name)) {
      index[name as KnownHeader] = position
    }
  })
  if (index.title == null) return { ok: false, error: 'no_title_column' }

  const dataRows = rows.slice(1)
  if (overRowLimit(dataRows.length)) {
    return { ok: false, error: 'too_many_rows' }
  }

  const cell = (fields: string[], key: KnownHeader): string => {
    const at = index[key]
    return at == null ? '' : (fields[at] ?? '')
  }

  let skipped = 0
  const parsed = dataRows.flatMap((fields) => {
    const raw = {
      title: cell(fields, 'title'),
      address: cell(fields, 'address'),
      note: cell(fields, 'note'),
      comment: cell(fields, 'comment'),
      url: cell(fields, 'url'),
    }
    if (!hasTitle(raw)) {
      skipped += 1
      return []
    }
    return [shapeRow(raw, coordsFromGoogleMapsUrl(raw.url))]
  })

  return { ok: true, source: 'google_csv', rows: parsed, skipped }
}
