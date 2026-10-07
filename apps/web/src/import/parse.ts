import { parseCsv } from './csv.js'
import { parseGeoJson } from './geojson.js'
import { parseKml } from './kml.js'
import { maxImportFileBytes, type ParseResult } from './model.js'

/** Reads and parses a dropped or picked import file (R-23-02). */
export async function parseImportFile(file: File): Promise<ParseResult> {
  if (file.size > maxImportFileBytes) return { ok: false, error: 'too_large' }
  const name = file.name.toLowerCase()
  if (name.endsWith('.kmz') || name.endsWith('.zip')) {
    return { ok: false, error: 'kmz' }
  }
  if (name.endsWith('.csv')) return parseCsv(await readText(file))
  if (name.endsWith('.geojson') || name.endsWith('.json')) {
    return parseGeoJson(await readText(file))
  }
  if (name.endsWith('.kml')) return parseKml(await readText(file))
  return { ok: false, error: 'unsupported' }
}

async function readText(file: File): Promise<string> {
  try {
    return await file.text()
  } catch {
    return ''
  }
}
