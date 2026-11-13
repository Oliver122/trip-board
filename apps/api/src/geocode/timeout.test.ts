import type { FastifyInstance } from 'fastify'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'

describe('geocode timeout', () => {
  let db: TestDatabase
  let app: FastifyInstance
  const requested: number[] = []
  let started: () => void = () => undefined

  beforeAll(async () => {
    db = await createTestDatabase()
    const config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
    })
    const geocodeFetch: typeof fetch = async (input, init) => {
      const url = input instanceof URL ? input : new URL(String(input))
      const q = url.searchParams.get('q') ?? ''
      if (q === 'stall') {
        started()
        const signal = init?.signal
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason))
        })
      }
      return new Response(
        JSON.stringify([{ display_name: q, lat: '35.0', lon: '135.0' }]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    app = await buildApp(db.pool, {
      config,
      now: () => new Date('2026-06-01T00:00:00.000Z'),
      geocodeFetch,
      // Fake timers do not control AbortSignal.timeout, so build the signal
      // from a timer the test can drive.
      geocodeTimeout: (ms) => {
        requested.push(ms)
        const controller = new AbortController()
        setTimeout(() => controller.abort(new Error('timeout')), ms)
        return controller.signal
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(async () => {
    await app.close()
    await db.pool.end()
    await db.drop()
  })

  it('T-44-04 answers 502 after 5 s and the gate is not stuck', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId: '100000000000004400' },
    })
    expect(login.statusCode).toBe(200)
    const cookie = String(login.headers['set-cookie'])
      .split(';')[0]
      ?.trim() as string

    const begun = new Promise<void>((resolve) => {
      started = resolve
    })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const stalled = app.inject({
      method: 'GET',
      url: '/geocode/search?q=stall',
      headers: { cookie },
    })
    await begun
    await vi.advanceTimersByTimeAsync(4999)
    await vi.advanceTimersByTimeAsync(1)
    const failed = await stalled
    expect(failed.statusCode).toBe(502)
    expect(failed.json()).toEqual({ error: 'geocode_unavailable' })
    expect(requested).toEqual([5000])

    vi.useRealTimers()
    const next = await app.inject({
      method: 'GET',
      url: '/geocode/search?q=after%20timeout',
      headers: { cookie },
    })
    expect(next.statusCode).toBe(200)
    expect(next.json().results[0]).toMatchObject({ label: 'after timeout' })
    expect(requested).toEqual([5000, 5000])
  }, 15_000)
})
