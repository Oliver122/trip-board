import {
  geocodeLangs,
  geocodeQueryLimit,
  type BBox,
  type GeocodeLang,
} from '@tripboard/shared'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import { deny, fieldErrors } from '../http/validate.js'
import { requireTripRole } from '../trips/roles.js'
import { NominatimClient } from './nominatim.js'
import {
  createGeocodeService,
  GeocodeNotFoundError,
  GeocodeUpstreamError,
} from './store.js'

export type GeocodeRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
  fetch?: typeof fetch
}

const knownMessages = new Set(['empty', 'too_long', 'invalid'])

const searchSchema = z
  .object({
    q: z.string().optional(),
    lang: z.string().optional(),
    tripId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const query = data.q?.trim() ?? ''
    if (!data.q || query.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['q'],
        message: 'empty',
      })
    } else if (query.length > geocodeQueryLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['q'],
        message: 'too_long',
      })
    }
    if (data.lang !== undefined && !isLang(data.lang)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lang'],
        message: 'invalid',
      })
    }
    if (
      data.tripId !== undefined &&
      !z.string().uuid().safeParse(data.tripId).success
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tripId'],
        message: 'invalid',
      })
    }
  })

const reverseSchema = z
  .object({
    lat: z.string().optional(),
    lng: z.string().optional(),
    lang: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    checkCoord(data.lat, -90, 90, 'lat', ctx)
    checkCoord(data.lng, -180, 180, 'lng', ctx)
    if (data.lang !== undefined && !isLang(data.lang)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lang'],
        message: 'invalid',
      })
    }
  })

export function registerGeocodeRoutes(
  app: FastifyInstance,
  options: GeocodeRouteOptions,
): void {
  const { pool, config, now } = options
  const secure = config.NODE_ENV === 'production'
  const service = createGeocodeService(
    pool,
    new NominatimClient({
      fetch: options.fetch ?? globalThis.fetch,
      baseUrl: config.NOMINATIM_BASE_URL,
      userAgent: config.NOMINATIM_USER_AGENT,
      referer: config.WEB_ORIGIN,
    }),
  )

  app.get('/geocode/search', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const query = oneQuery(request.query)
    const parsed = searchSchema.safeParse(query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        fields: fieldErrors(parsed.error, knownMessages),
      })
    }
    const lang = (parsed.data.lang ?? 'en') as GeocodeLang
    let bbox: BBox | undefined
    if (parsed.data.tripId) {
      const scope = await tripBBox(pool, parsed.data.tripId, user.id)
      if (!scope.ok) return deny(reply, scope.status)
      bbox = scope.bbox
    }
    return run(reply, () =>
      service.search({
        q: parsed.data.q?.trim() ?? '',
        lang,
        bbox,
      }),
    )
  })

  app.get('/geocode/reverse', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const query = oneQuery(request.query)
    const parsed = reverseSchema.safeParse(query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        fields: fieldErrors(parsed.error, knownMessages),
      })
    }
    const lang = (parsed.data.lang ?? 'en') as GeocodeLang
    return run(reply, () =>
      service.reverse({
        lat: Number(parsed.data.lat),
        lng: Number(parsed.data.lng),
        lang,
      }),
    )
  })
}

async function run(
  reply: FastifyReply,
  load: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await load()
  } catch (error) {
    if (error instanceof GeocodeNotFoundError) {
      return reply.code(404).send({ error: 'not_found' })
    }
    if (error instanceof GeocodeUpstreamError) {
      return reply.code(502).send({ error: 'geocode_unavailable' })
    }
    throw error
  }
}

async function tripBBox(
  pool: Pool,
  tripId: string,
  userId: string,
): Promise<{ ok: true; bbox: BBox } | { ok: false; status: 404 }> {
  const access = await requireTripRole(pool, tripId, userId, 'visitor')
  if (!access.ok) return { ok: false, status: 404 }
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
  if (!row) return { ok: false, status: 404 }
  return {
    ok: true,
    bbox: {
      minLng: row.bbox_min_lng,
      minLat: row.bbox_min_lat,
      maxLng: row.bbox_max_lng,
      maxLat: row.bbox_max_lat,
    },
  }
}

function oneQuery(query: unknown): Record<string, string | undefined> {
  if (!query || typeof query !== 'object') return {}
  const out: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(query)) {
    out[key] = typeof value === 'string' ? value : undefined
  }
  return out
}

function isLang(value: string): value is GeocodeLang {
  return (geocodeLangs as readonly string[]).includes(value)
}

function checkCoord(
  value: string | undefined,
  min: number,
  max: number,
  path: 'lat' | 'lng',
  ctx: z.RefinementCtx,
) {
  if (value == null || value.trim() === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: 'invalid',
    })
    return
  }
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: 'invalid',
    })
  }
}
