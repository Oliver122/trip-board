import { healthResponseSchema, maxUploadBytes } from '@tripboard/shared'
import Fastify from 'fastify'
import type { Pool } from 'pg'
import { registerAuthRoutes } from './auth/routes.js'
import { loadConfig, type AppConfig } from './config.js'
import { pingDatabase } from './db.js'
import { registerGeocodeRoutes } from './geocode/routes.js'
import { registerImageRoutes } from './images/routes.js'
import { registerPlanRoutes } from './plan/routes.js'
import { UploadLimiter } from './images/limit.js'
import { createS3Storage, type ObjectStorage } from './images/storage.js'
import { JoinLimiter } from './members/limit.js'
import { registerMemberRoutes } from './members/routes.js'
import { registerSpotRoutes } from './spots/routes.js'
import { registerTripRoutes } from './trips/routes.js'

export type BuildAppOptions = {
  config?: AppConfig
  now?: () => Date
  geocodeFetch?: typeof fetch
  storage?: ObjectStorage
  beforeImageInsert?: () => Promise<void>
  joinLimiter?: JoinLimiter
}

export async function buildApp(pool: Pool, options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig(process.env)
  const now = options.now ?? (() => new Date())
  const app = Fastify({
    logger: false,
    bodyLimit: maxUploadBytes + 2 * 1024 * 1024,
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
    limiter: options.joinLimiter ?? new JoinLimiter(),
  })
  registerSpotRoutes(app, { pool, config, now })
  registerPlanRoutes(app, { pool, config, now })
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

  return app
}
