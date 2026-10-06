import {
  geocodePlaceSchema,
  type GeocodeLang,
  type GeocodePlace,
} from '@tripboard/shared'
import { RequestGate } from './gate.js'

export class GeocodeUpstreamError extends Error {
  constructor() {
    super('geocode_unavailable')
    this.name = 'GeocodeUpstreamError'
  }
}

export class GeocodeNotFoundError extends Error {
  constructor() {
    super('not_found')
    this.name = 'GeocodeNotFoundError'
  }
}

export type NominatimClientOptions = {
  fetch: typeof fetch
  baseUrl: string
  userAgent: string
  referer: string
  gate?: RequestGate
}

export class NominatimClient {
  private readonly fetch: typeof fetch
  private readonly baseUrl: string
  private readonly userAgent: string
  private readonly referer: string
  private readonly gate: RequestGate

  constructor(options: NominatimClientOptions) {
    this.fetch = options.fetch
    this.baseUrl = options.baseUrl
    this.userAgent = options.userAgent
    this.referer = options.referer
    this.gate = options.gate ?? new RequestGate(1000)
  }

  search(input: {
    q: string
    lang: GeocodeLang
    viewbox?: string
  }): Promise<GeocodePlace[]> {
    const url = new URL('/search', this.baseUrl)
    url.searchParams.set('q', input.q)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '5')
    url.searchParams.set('accept-language', input.lang)
    if (input.viewbox) url.searchParams.set('viewbox', input.viewbox)
    return this.gate.run(async () => parseSearch(await this.getJson(url)))
  }

  reverse(input: {
    lat: number
    lng: number
    lang: GeocodeLang
  }): Promise<GeocodePlace> {
    const url = new URL('/reverse', this.baseUrl)
    url.searchParams.set('lat', String(input.lat))
    url.searchParams.set('lon', String(input.lng))
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('accept-language', input.lang)
    return this.gate.run(async () => parsePlace(await this.getJson(url)))
  }

  private async getJson(url: URL): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': this.userAgent,
          referer: this.referer,
        },
      })
    } catch {
      throw new GeocodeUpstreamError()
    }
    if (!response.ok) throw new GeocodeUpstreamError()
    try {
      return await response.json()
    } catch {
      throw new GeocodeUpstreamError()
    }
  }
}

export function parseSearch(body: unknown): GeocodePlace[] {
  if (!Array.isArray(body)) throw new GeocodeUpstreamError()
  return body.map((row) => parsePlace(row))
}

export function parsePlace(body: unknown): GeocodePlace {
  if (!body || typeof body !== 'object') throw new GeocodeUpstreamError()
  const row = body as Record<string, unknown>
  if (typeof row.error === 'string') throw new GeocodeNotFoundError()
  const lat = typeof row.lat === 'number' ? row.lat : Number(row.lat)
  const lng = typeof row.lon === 'number' ? row.lon : Number(row.lon)
  if (typeof row.display_name !== 'string' || row.display_name.length === 0) {
    throw new GeocodeUpstreamError()
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new GeocodeUpstreamError()
  }
  const bbox = boundingBox(row.boundingbox)
  return geocodePlaceSchema.parse({
    label: row.display_name,
    lat,
    lng,
    ...(bbox ? { bbox } : {}),
  })
}

function boundingBox(
  value: unknown,
): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
  if (!Array.isArray(value) || value.length < 4) return null
  const south = Number(value[0])
  const north = Number(value[1])
  const west = Number(value[2])
  const east = Number(value[3])
  if (![south, north, west, east].every(Number.isFinite)) return null
  if (south > north || west > east) return null
  return { minLat: south, maxLat: north, minLng: west, maxLng: east }
}
