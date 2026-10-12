// One parser for Google Maps links (R-33-01), used by the Takeout import, the
// board's paste handler and the from-link API route.

export type GoogleMapsLink = {
  lat: number | null
  lng: number | null
  name: string | null
  addressHint: string | null
}

const num = '-?\\d+(?:\\.\\d+)?'

const coordPatterns = [
  new RegExp(`!3d(${num})!4d(${num})`),
  new RegExp(`@(${num}),(${num})`),
  new RegExp(`/search/(${num}),(${num})`),
  new RegExp(`[?&]q=(${num}),(${num})`),
]

const coordPair = new RegExp(`^\\s*${num}\\s*,\\s*${num}\\s*$`)

function inRange(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

/**
 * Reads lat/lng from a Google Maps URL, trying each pattern in order
 * (C-IMP-06). A pattern that matches but is out of range still counts as
 * that pattern's answer: it does not fall through to a weaker pattern
 * matching the same coordinates elsewhere in the URL.
 */
export function coordsFromGoogleMapsUrl(
  url: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!url) return null
  for (const pattern of coordPatterns) {
    const match = pattern.exec(url)
    if (!match) continue
    const lat = Number(match[1])
    const lng = Number(match[2])
    if (inRange(lat, lng)) return { lat, lng }
    return null
  }
  return null
}

function decode(value: string): string | null {
  try {
    const text = decodeURIComponent(value.replace(/\+/g, ' ')).trim()
    return text === '' ? null : text
  } catch {
    return null
  }
}

function nameFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const place = /\/maps\/place\/([^/]+)/.exec(parsed.pathname)
  if (place?.[1]) {
    const name = decode(place[1])
    if (name && !coordPair.test(name)) return name
  }
  for (const key of ['q', 'query']) {
    const value = parsed.searchParams.get(key)?.trim()
    if (value && !coordPair.test(value)) return value
  }
  return null
}

/** The first non-URL lines of share text: name, then address hint. */
function nameFromText(
  text: string,
): { name: string; addressHint: string | null } | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/https?:\/\/\S+/g, '').trim())
    .filter((line) => line !== '')
  const first = lines[0]
  if (!first) return null
  if (lines.length > 1) {
    return { name: first, addressHint: lines[1] ?? null }
  }
  // One line: "Name, Address".
  const comma = first.indexOf(',')
  if (comma > 0) {
    const address = first.slice(comma + 1).trim()
    return {
      name: first.slice(0, comma).trim(),
      addressHint: address === '' ? null : address,
    }
  }
  return { name: first, addressHint: null }
}

/** Name, address hint and point from a Google Maps URL and optional share text. */
export function parseGoogleMapsLink(
  url: string,
  text?: string,
): GoogleMapsLink {
  const coords = coordsFromGoogleMapsUrl(url)
  let name = nameFromUrl(url)
  let addressHint: string | null = null
  const fromText = text ? nameFromText(text) : null
  if (fromText) {
    name = fromText.name
    addressHint = fromText.addressHint
  }
  return {
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    name,
    addressHint,
  }
}

/** The first http(s) URL in a piece of text, or null. */
export function firstHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const match = /https?:\/\/[^\s<>"']+/i.exec(value)
  return match ? match[0] : null
}

const tld = '[a-z]{2,3}(?:\\.[a-z]{2})?'
const mapsHost = new RegExp(`^maps\\.google\\.${tld}$`)
const googleHost = new RegExp(`^(?:www\\.)?google\\.${tld}$`)

/** True when the URL's host and path are an accepted Google Maps link (R-33-02). */
export function isGoogleMapsUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  const host = parsed.hostname.toLowerCase()
  const path = parsed.pathname
  if (host === 'maps.app.goo.gl') return true
  if (host === 'goo.gl') return /^\/maps/.test(path)
  if (mapsHost.test(host)) return true
  if (googleHost.test(host)) return /^\/(?:maps|search)/.test(path)
  return false
}

/**
 * The first http(s) URL in `url`, or else in `text`, when it is a Google Maps
 * link; null otherwise (R-33-02, R-33-05).
 */
export function googleMapsUrlIn(input: {
  url?: string | null
  text?: string | null
}): string | null {
  const found = firstHttpUrl(input.url) ?? firstHttpUrl(input.text)
  return found && isGoogleMapsUrl(found) ? found : null
}
