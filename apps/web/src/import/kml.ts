import type { ParseResult } from './model.js'
import { hasTitle, overRowLimit, shapeRow } from './model.js'

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim()
}

function pointCoords(placemark: Element): { lat: number; lng: number } | null {
  const text = placemark
    .querySelector('Point > coordinates')
    ?.textContent?.trim()
  if (!text) return null
  const [lngText, latText] = text.split(',')
  const lng = Number(lngText)
  const lat = Number(latText)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/** Parses a Google My Maps KML export (R-23-05). */
export function parseKml(source: string): ParseResult {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(source, 'text/xml')
  } catch {
    return { ok: false, error: 'unreadable' }
  }
  if (doc.querySelector('parsererror')) {
    return { ok: false, error: 'unreadable' }
  }
  const placemarks = [...doc.querySelectorAll('Placemark')]
  if (overRowLimit(placemarks.length)) {
    return { ok: false, error: 'too_many_rows' }
  }

  let skipped = 0
  const rows = placemarks.flatMap((placemark) => {
    const coords = pointCoords(placemark)
    if (!coords) {
      skipped += 1
      return []
    }
    const raw = {
      title: placemark.querySelector('name')?.textContent ?? '',
      note: stripHtml(
        placemark.querySelector('description')?.textContent ?? '',
      ),
    }
    if (!hasTitle(raw)) {
      skipped += 1
      return []
    }
    return [shapeRow(raw, coords)]
  })

  return { ok: true, source: 'kml', rows, skipped }
}
