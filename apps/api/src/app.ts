import { randomUUID } from 'node:crypto'
import { enterClientId } from './activity/client.js'
import { healthResponseSchema, maxUploadBytes } from '@tripboard/shared'
import Fastify from 'fastify'
import type { Pool } from 'pg'
import { readCookie, SESSION_COOKIE } from './auth/cookies.js'
import { registerAdminRoutes } from './admin/routes.js'
import { registerAuthRoutes } from './auth/routes.js'
import { registerExportRoutes } from './export/routes.js'
import { loadConfig, type AppConfig } from './config.js'
import { pingDatabase } from './db.js'
import { registerGeocodeRoutes } from './geocode/routes.js'
import { applySecurityHeaders, blobOrigin } from './http/headers.js'
import { RequestLimiter } from './http/limit.js'
import { TripHub } from './live/hub.js'
import { isLiveEvents, registerLiveRoutes } from './live/routes.js'
import { registerImageRoutes } from './images/routes.js'
import { registerPlanRoutes } from './plan/routes.js'
import { UploadLimiter } from './images/limit.js'
import { createS3Storage, type ObjectStorage } from './images/storage.js'
import { JoinLimiter, joinRateLimit } from './members/limit.js'
import { registerMemberRoutes } from './members/routes.js'
import { registerCommentRoutes } from './comments/routes.js'
import { registerSpotRoutes } from './spots/routes.js'
import { registerTripRoutes } from './trips/routes.js'

export type BuildAppOptions = {
  config?: AppConfig
  now?: () => Date
  geocodeFetch?: typeof fetch
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
    bodyLimit: maxUploadBytes + 2 * 1024 * 1024,
  })

  app.setErrorHandler((error: unknown, request, reply) => {
    const statusCode = statusCodeOf(error)
    if (statusCode < 500) {
      const message = error instanceof Error ? error.message : 'error'
      return reply.code(statusCode).send({ error: message })
    }
    request.log.error({ requestId: request.id, err: error }, 'internal')
    return reply.code(500).send({ error: 'internal', requestId: request.id })
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
      return reply.code(429).send({ error: 'rate_limited' })
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
  registerSpotRoutes(app, { pool, config, now })
  registerCommentRoutes(app, { pool, config, now })
  registerLiveRoutes(app, { pool, config, now, hub })
  registerPlanRoutes(app, { pool, config, now })
  registerExportRoutes(app, { pool, config, now })
  registerGeocodeRoutes(app, {
    pool,
    config,
    now,
    fetch: options.geocodeFetch,
  })
  await registerImageRoutes(app, {
    pool,
    config,
    now,
    storage: options.storage ?? createS3Storage(config),
    limiter: new UploadLimiter(),
    beforeImageInsert: options.beforeImageInsert,
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
