import {
  googleMapsUrlIn,
  parseGoogleMapsLink,
  placeFromLinkBodySchema,
  type BBox,
  type GeocodeLang,
} from '@tripboard/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { originAllowed, requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import type { GeocodeService } from '../geocode/store.js'
import { sendError } from '../http/errors.js'
import { idParams, parseParams } from '../http/params.js'
import { deny, parseBody } from '../http/validate.js'
import { requireTripRole } from '../trips/roles.js'
import { PlaceLinkLimiter } from './limit.js'
import { locatePlace } from './locate.js'
import { isShortLink, LinkResolveError, resolveShortLink } from './resolve.js'

export type PlaceRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
  geocode: GeocodeService
  /** Fetcher used to follow short-link redirects; tests inject a fake. */
  fetch?: typeof fetch
}

const knownMessages = new Set(['invalid'])

export function registerPlaceRoutes(
  app: FastifyInstance,
  options: PlaceRouteOptions,
): void {
  const { pool, config, now, geocode } = options
  const secure = config.NODE_ENV === 'production'
  const limiter = new PlaceLinkLimiter()

  app.post('/trips/:id/places/from-link', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const access = await requireTripRole(pool, params.id, user.id, 'planner')
    if (!access.ok) return deny(reply, access.status)
    const body = parseBody(
      placeFromLinkBodySchema,
      request.body ?? {},
      reply,
      knownMessages,
    )
    if (!body) return
    const retryAfter = limiter.check(user.id, now())
    if (retryAfter !== null) {
      reply.header('retry-after', String(retryAfter))
      return sendError(reply, 429, 'rate_limited')
    }

    const link = googleMapsUrlIn(body)
    if (!link) return sendError(reply, 400, 'link_not_google_maps')

    let resolved = link
    if (isShortLink(link)) {
      try {
        resolved = await resolveShortLink(
          link,
          options.fetch ?? globalThis.fetch,
        )
      } catch (error) {
        if (error instanceof LinkResolveError) {
          return sendError(reply, 502, 'link_resolve_failed')
        }
        throw error
      }
    }

    const parsed = parseGoogleMapsLink(resolved, body.text)
    // A short link has no point of its own; the original may still carry one.
    const original = parseGoogleMapsLink(link)
    const bbox = await tripBBox(pool, params.id)
    return locatePlace(
      {
        link,
        lat: parsed.lat ?? original.lat,
        lng: parsed.lng ?? original.lng,
        name: parsed.name,
        addressHint: parsed.addressHint,
      },
      geocode,
      bbox,
      langOf(request),
    )
  })
}

function langOf(request: FastifyRequest): GeocodeLang {
  const header = request.headers['accept-language']
  return typeof header === 'string' && header.toLowerCase().startsWith('de')
    ? 'de'
    : 'en'
}

async function tripBBox(pool: Pool, tripId: string): Promise<BBox> {
  const result = await pool.query<{
    bbox_min_lng: number
    bbox_min_lat: number
    bbox_max_lng: number
    bbox_max_lat: number
  }>(
    `
    SELECT bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat
    FROM trips
    WHERE id = $1
    `,
    [tripId],
  )
  const row = result.rows[0]
  if (!row) throw new Error('trip vanished')
  return {
    minLng: row.bbox_min_lng,
    minLat: row.bbox_min_lat,
    maxLng: row.bbox_max_lng,
    maxLat: row.bbox_max_lat,
  }
}
