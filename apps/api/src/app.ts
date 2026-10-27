import { randomUUID } from 'node:crypto'
import { enterClientId } from './activity/client.js'
import { healthResponseSchema, fileSizeLimits } from '@tripboard/shared'
import Fastify from 'fastify'
import type { Pool } from 'pg'
import { readCookie, SESSION_COOKIE } from './auth/cookies.js'
import { registerAdminRoutes } from './admin/routes.js'
import { registerAuthRoutes } from './auth/routes.js'
import { registerExportRoutes } from './export/routes.js'
import { loadConfig, type AppConfig } from './config.js'
import { pingDatabase } from './db.js'
import { NominatimClient } from './geocode/nominatim.js'
import { registerGeocodeRoutes } from './geocode/routes.js'
import { createGeocodeService } from './geocode/store.js'
import { applySecurityHeaders, blobOrigin } from './http/headers.js'
import { RequestLimiter } from './http/limit.js'
import { TripHub } from './live/hub.js'
import { isLiveEvents, registerLiveRoutes } from './live/routes.js'
import { registerImageRoutes } from './images/routes.js'
import type { WebFetchOptions } from './images/web-fetch.js'
import { registerPlaceRoutes } from './places/routes.js'
import { registerPlanRoutes } from './plan/routes.js'
import { UploadLimiter } from './images/limit.js'
import { createS3Storage, type ObjectStorage } from './images/storage.js'
import { JoinLimiter, joinRateLimit } from './members/limit.js'
import { registerMemberRoutes } from './members/routes.js'
import { registerCommentRoutes } from './comments/routes.js'
import { registerKindRoutes } from './kinds/routes.js'
import { registerSpotRoutes } from './spots/routes.js'
import { registerTripRoutes } from './trips/routes.js'
import { sendError } from './http/errors.js'

export type BuildAppOptions = {
  config?: AppConfig
  now?: () => Date
  geocodeFetch?: typeof fetch
  /** Follows Google Maps short links (step 33). */
  placeLinkFetch?: typeof fetch
  /** Downloads photos from the web (step 34). */
  webFetch?: WebFetchOptions
  /** Talks to the Wikimedia Commons API (step 34). */
  commonsFetch?: typeof fetch
  storage?: ObjectStorage
  beforeImageInsert?: () => Promise<void>
  beforeAdminCommit?: () => Promise<void>
  webhookFetch?: typeof fetch
  joinLimiter?: JoinLimiter
  limiter?: RequestLimiter
  logStream?: { write: (message: string) => void }
}

export async function buildApp(pool: Pool, options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig(process.env)
  const now = options.now ?? (() => new Date())
  const limiter = options.limiter ?? new RequestLimiter()
  const app = Fastify({
    logger: options.logStream
      ? { level: 'info', stream: options.logStream }
      : config.NODE_ENV === 'test'
        ? false
        : { level: 'info' },
    genReqId: () => randomUUID(),
    bodyLimit: fileSizeLimits.default + 2 * 1024 * 1024,
  })

  app.setErrorHandler((error: unknown, request, reply) => {
    const statusCode = statusCodeOf(error)
    if (statusCode < 500) {
      const message = error instanceof Error ? error.message : 'error'
      return sendError(reply, statusCode, message)
    }
    request.log.error({ requestId: request.id, err: error }, 'internal')
    return sendError(reply, 500, 'internal', { requestId: request.id })
  })

  app.addHook('onRequest', async (request, reply) => {
    const rawClient = request.headers['x-client-id']
    enterClientId(typeof rawClient === 'string' ? rawClient.slice(0, 80) : null)
    reply.header('x-request-id', request.id)
    applySecurityHeaders(reply, {
      production: config.NODE_ENV === 'production',
      blobOrigin: blobOrigin(config.S3_ENDPOINT),
    })
    if (isLiveEvents(request.url)) return
    const token = readCookie(request.headers.cookie, SESSION_COOKIE)
    const key = token ? `user:${token}` : `ip:${request.ip}`
    const decision = limiter.check(key, now())
    if (!decision.ok) {
      reply.header('retry-after', String(decision.retryAfter))
      return sendError(reply, 429, 'rate_limited')
    }
  })

  const hub = new TripHub(
    config.DATABASE_URL,
    (message) => {
      app.log.info(message)
    },
    now,
  )
  await hub.start()
  app.decorate('tripHub', hub)
  app.addHook('onClose', async () => {
    await hub.stop()
  })

  app.get('/health', async (_request, reply) => {
    const dbUp = await pingDatabase(pool)
    const body = healthResponseSchema.parse({
      status: 'ok',
      db: dbUp ? 'ok' : 'down',
    })
    if (!dbUp) reply.code(503)
    return body
  })

  registerAuthRoutes(app, { pool, config, now })
  registerTripRoutes(app, { pool, config, now })
  registerMemberRoutes(app, {
    pool,
    config,
    now,
    limiter:
      options.joinLimiter ??
      new JoinLimiter(config.NODE_ENV === 'test' ? 10_000 : joinRateLimit),
  })
  registerKindRoutes(app, { pool, config, now })
  registerSpotRoutes(app, { pool, config, now })
  registerCommentRoutes(app, { pool, config, now })
  registerLiveRoutes(app, { pool, config, now, hub })
  registerPlanRoutes(app, { pool, config, now })
  registerExportRoutes(app, { pool, config, now })
  // One service, so the board's search and the place links share Nominatim's
  // one-request-per-second gate and the cache.
  const geocode = createGeocodeService(
    pool,
    new NominatimClient({
      fetch: options.geocodeFetch ?? globalThis.fetch,
      baseUrl: config.NOMINATIM_BASE_URL,
      userAgent: config.NOMINATIM_USER_AGENT,
      referer: config.WEB_ORIGIN,
    }),
  )
  registerGeocodeRoutes(app, { pool, config, now, service: geocode })
  registerPlaceRoutes(app, {
    pool,
    config,
    now,
    geocode,
    fetch: options.placeLinkFetch,
  })
  await registerImageRoutes(app, {
    pool,
    config,
    now,
    storage: options.storage ?? createS3Storage(config),
    limiter: new UploadLimiter(),
    beforeImageInsert: options.beforeImageInsert,
    webFetch: options.webFetch,
    commonsFetch: options.commonsFetch,
  })

  if (config.NODE_ENV === 'test') {
    app.get('/test/ping', async () => ({ ok: true }))
    app.get('/test/boom', async () => {
      throw new Error('boom secret')
    })
  }

  registerAdminRoutes(app, {
    pool,
    config,
    now,
    hooks: { beforeCommit: options.beforeAdminCommit },
    webhookFetch: options.webhookFetch,
  })

  return app
}

function statusCodeOf(error: unknown): number {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode
  }
  return 500
}
