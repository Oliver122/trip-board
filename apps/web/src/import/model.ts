import {
  spotImportLimit,
  spotLimits,
  type SpotImportSource,
} from '@tripboard/shared'

export const maxImportFileBytes = 5 * 1024 * 1024

export type ParsedRow = {
  title: string
  address: string | null
  info: string | null
  link: string | null
  lat: number | null
  lng: number | null
  shortened: boolean
}

export type ParseError =
  | 'too_large'
  | 'too_many_rows'
  | 'kmz'
  | 'unsupported'
  | 'no_title_column'
  | 'unreadable'

export type ParseResult =
  | { ok: true; source: SpotImportSource; rows: ParsedRow[]; skipped: number }
  | { ok: false; error: ParseError }

export type RawRow = {
  title: string
  address?: string | null
  note?: string | null
  comment?: string | null
  url?: string | null
  lat?: number | null
  lng?: number | null
}

function blank(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function joinInfo(
  note: string | null | undefined,
  comment: string | null | undefined,
): string | null {
  const parts = [blank(note), blank(comment)].filter(
    (value): value is string => value != null,
  )
  return parts.length > 0 ? parts.join('\n\n') : null
}

/** An http(s) URL at most 500 characters, otherwise no link (R-23-07). */
export function rowLink(url: string | null | undefined): string | null {
  const trimmed = blank(url)
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) return null
  if (trimmed.length > spotLimits.link) return null
  return trimmed
}

/** Shapes one source row into a spot row, cutting title and info to their limits. */
export function shapeRow(
  raw: RawRow,
  coords: { lat: number; lng: number } | null,
): ParsedRow {
  let shortened = false
  let title = raw.title.trim()
  if (title.length > spotLimits.title) {
    title = title.slice(0, spotLimits.title)
    shortened = true
  }
  let info = joinInfo(raw.note, raw.comment)
  if (info && info.length > spotLimits.info) {
    info = info.slice(0, spotLimits.info)
    shortened = true
  }
  return {
    title,
    address: blank(raw.address),
    info,
    link: rowLink(raw.url),
    lat: coords?.lat ?? raw.lat ?? null,
    lng: coords?.lng ?? raw.lng ?? null,
    shortened,
  }
}

export function hasTitle(raw: { title: string }): boolean {
  return raw.title.trim().length > 0
}

/** More than the shared import limit is an error; nothing is imported (R-23-08). */
export function overRowLimit(total: number): boolean {
  return total > spotImportLimit
}

export { spotImportLimit }
