import { healthResponseSample, healthResponseSchema } from '@tripboard/shared'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { buildApp } from './app.js'
import { createPool } from './db.js'

// T-00-01: 200 with db ok, 503 with db down
describe('health', () => {
  const pools: Pool[] = []
  const apps: FastifyInstance[] = []

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
    await Promise.all(pools.splice(0).map((pool) => pool.end()))
  })

  it.skipIf(!process.env.DATABASE_URL)(
    'returns 200 when Postgres answers',
    async () => {
      const databaseUrl = process.env.DATABASE_URL
      if (!databaseUrl) return

      const pool = createPool(databaseUrl)
      pools.push(pool)
      const app = await buildApp(pool)
      apps.push(app)

      const response = await app.inject({ method: 'GET', url: '/health' })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ status: 'ok', db: 'ok' })
    },
  )

  it('returns 503 when the database is unreachable', async () => {
    const pool = createPool(
      'postgres://tripboard:tripboard@127.0.0.1:59999/tripboard',
    )
    pools.push(pool)
    const app = await buildApp(pool)
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ status: 'ok', db: 'down' })
  })
})

// T-00-03 (api side; the web side is apps/web/src/health-schema.test.ts)
describe('shared health schema', () => {
  it('accepts the shared sample', () => {
    expect(healthResponseSchema.parse(healthResponseSample)).toEqual(
      healthResponseSample,
    )
  })
})
