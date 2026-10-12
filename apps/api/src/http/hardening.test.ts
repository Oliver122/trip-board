import { Writable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig } from '../config.js'
import { createPool } from '../db.js'
import { contentSecurityPolicy, tileOrigin } from './headers.js'

describe('hardening', () => {
  const pools: Pool[] = []
  const apps: FastifyInstance[] = []

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
    await Promise.all(pools.splice(0).map((pool) => pool.end()))
  })

  it('T-15-03 sends CSP, nosniff, referrer policy, and HSTS in production', async () => {
    const databaseUrl =
      'postgres://tripboard:tripboard@127.0.0.1:59999/tripboard'
    const pool = createPool(databaseUrl)
    pools.push(pool)
    const config = loadConfig({
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://trip.example',
      DISCORD_CLIENT_ID: 'prod-client',
      DISCORD_CLIENT_SECRET: 'prod-secret',
      AUTH_SECRET: 'production-auth-secret',
      S3_ENDPOINT: 'https://blobs.example',
      S3_BUCKET: 'tripboard',
      S3_ACCESS_KEY: 'prod-key',
      S3_SECRET_KEY: 'prod-secret',
    })
    const app = await buildApp(pool, { config })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health' })
    const csp = String(response.headers['content-security-policy'])
    expect(csp).toBe(contentSecurityPolicy('https://blobs.example'))
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain(tileOrigin)
    expect(csp).toContain('img-src')
    expect(csp).toMatch(/img-src [^;]*https:\/\/upload\.wikimedia\.org/)
    expect(csp).toContain('https://blobs.example')
    expect(csp).toContain('blob:')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['referrer-policy']).toBe(
      'strict-origin-when-cross-origin',
    )
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=15552000; includeSubDomains',
    )
  })

  it('omits HSTS outside production', async () => {
    const pool = createPool(
      'postgres://tripboard:tripboard@127.0.0.1:59999/tripboard',
    )
    pools.push(pool)
    const app = await buildApp(pool, {
      config: loadConfig({
        DATABASE_URL:
          'postgres://tripboard:tripboard@127.0.0.1:59999/tripboard',
        NODE_ENV: 'test',
      }),
    })
    apps.push(app)
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.headers['strict-transport-security']).toBeUndefined()
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })

  it('T-15-04 rejects the 301st request in a minute', async () => {
    const pool = createPool(
      'postgres://tripboard:tripboard@127.0.0.1:59999/tripboard',
    )
    pools.push(pool)
    const now = new Date('2026-06-01T00:00:00.000Z')
    const app = await buildApp(pool, {
      config: loadConfig({
        DATABASE_URL:
          'postgres://tripboard:tripboard@127.0.0.1:59999/tripboard',
        NODE_ENV: 'test',
      }),
      now: () => now,
    })
    apps.push(app)

    for (let index = 0; index < 300; index += 1) {
      const response = await app.inject({ method: 'GET', url: '/test/ping' })
      expect(response.statusCode).toBe(200)
    }
    const blocked = await app.inject({ method: 'GET', url: '/test/ping' })
    expect(blocked.statusCode).toBe(429)
    expect(blocked.headers['retry-after']).toBe('60')
    expect(blocked.json()).toEqual({ error: 'rate_limited' })
  })

  it('T-15-08 returns a request id and logs that same id', async () => {
    const pool = createPool(
      'postgres://tripboard:tripboard@127.0.0.1:59999/tripboard',
    )
    pools.push(pool)
    const lines: string[] = []
    const logStream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString())
        callback()
      },
    })
    const app = await buildApp(pool, {
      config: loadConfig({
        DATABASE_URL:
          'postgres://tripboard:tripboard@127.0.0.1:59999/tripboard',
        NODE_ENV: 'test',
      }),
      logStream,
    })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/test/boom' })
    expect(response.statusCode).toBe(500)
    const body = response.json() as { error: string; requestId: string }
    expect(body.error).toBe('internal')
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(response.body).not.toContain('boom secret')
    expect(lines.join('')).toContain(body.requestId)
    expect(response.headers['x-request-id']).toBe(body.requestId)
  })
})
