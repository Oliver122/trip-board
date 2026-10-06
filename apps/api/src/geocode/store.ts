import {
  geocodePlaceSchema,
  geocodeSearchSchema,
  nominatimViewbox,
  reverseCacheKey,
  searchCacheKey,
  type BBox,
  type GeocodeLang,
  type GeocodePlace,
  type GeocodeSearch,
} from '@tripboard/shared'
import type { Pool } from 'pg'
import {
  GeocodeNotFoundError,
  GeocodeUpstreamError,
  NominatimClient,
} from './nominatim.js'

const cacheTtl = "interval '30 days'"

export type GeocodeService = {
  search(input: {
    q: string
    lang: GeocodeLang
    bbox?: BBox
  }): Promise<GeocodeSearch>
  reverse(input: {
    lat: number
    lng: number
    lang: GeocodeLang
  }): Promise<GeocodePlace>
}

export function createGeocodeService(
  pool: Pool,
  client: NominatimClient,
): GeocodeService {
  const inflight = new Map<string, Promise<unknown>>()

  return {
    async search(input) {
      const viewbox = input.bbox ? nominatimViewbox(input.bbox) : undefined
      const key = searchCacheKey(input.lang, input.q, viewbox)
      const cached = await readCache(pool, key)
      if (cached) return geocodeSearchSchema.parse(cached)
      return share(inflight, key, async () => {
        const results = await client.search({
          q: input.q.trim(),
          lang: input.lang,
          viewbox,
        })
        const body = geocodeSearchSchema.parse({ results })
        await writeCache(pool, key, body)
        return body
      })
    },
    async reverse(input) {
      const key = reverseCacheKey(input.lang, input.lat, input.lng)
      const cached = await readCache(pool, key)
      if (cached) return geocodePlaceSchema.parse(cached)
      return share(inflight, key, async () => {
        const place = await client.reverse({
          lat: input.lat,
          lng: input.lng,
          lang: input.lang,
        })
        await writeCache(pool, key, place)
        return place
      })
    },
  }
}

async function share<T>(
  inflight: Map<string, Promise<unknown>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>
  const pending = load().finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, pending)
  return pending
}

async function readCache(pool: Pool, key: string): Promise<unknown | null> {
  const result = await pool.query<{ response: unknown }>(
    `
    SELECT response
    FROM geocode_cache
    WHERE query_key = $1
      AND created_at > now() - ${cacheTtl}
    `,
    [key],
  )
  return result.rows[0]?.response ?? null
}

async function writeCache(
  pool: Pool,
  key: string,
  response: unknown,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO geocode_cache (query_key, response)
    VALUES ($1, $2::jsonb)
    ON CONFLICT (query_key) DO UPDATE
    SET response = EXCLUDED.response,
        created_at = now()
    `,
    [key, JSON.stringify(response)],
  )
}

export { GeocodeNotFoundError, GeocodeUpstreamError }
