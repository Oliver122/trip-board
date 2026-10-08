import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { seedDatabase, seedIds } from '../db/seed.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'
const { fushimi } = seedIds.spots
const seedTrip = seedIds.trip

describe('comment live events', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig
  let base: string

  beforeAll(async () => {
    db = await createTestDatabase()
    await seedDatabase(db.pool)
    config = loadConfig({ DATABASE_URL: db.url, NODE_ENV: 'test', WEB_ORIGIN })
    app = await buildApp(db.pool, {
      config,
      now: () => new Date('2026-06-01T00:00:00.000Z'),
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (!address || typeof address === 'string') throw new Error('no port')
    base = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await app.close()
    await db.pool.end()
    await db.drop()
  })

  beforeEach(async () => {
    await db.pool.query(
      `DELETE FROM spot_comments; DELETE FROM spot_comment_reads`,
    )
  })

  async function login(discordId: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId },
    })
    expect(response.statusCode).toBe(200)
    const raw = response.headers['set-cookie']
    const cookies = Array.isArray(raw) ? raw : [raw ?? '']
    const session = cookies.find((value) => value.startsWith('tb_session='))
    return `tb_session=${(session ?? '').split(';')[0]!.slice('tb_session='.length)}`
  }

  it('T-24-09 a second member gets exactly one comment event per write, none for reads', async () => {
    const tom = await login('100000000000000003')
    const aiko = await login('100000000000000002')
    const stream = await fetch(`${base}/trips/${seedTrip}/events`, {
      headers: { cookie: tom },
    })
    expect(stream.status).toBe(200)
    const reader = stream.body!.getReader()
    const decoder = new TextDecoder()
    let text = ''
    const pump = (async () => {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) return
        text += decoder.decode(chunk.value, { stream: true })
      }
    })()
    const headers = {
      cookie: aiko,
      origin: WEB_ORIGIN,
      'content-type': 'application/json',
    }

    const created = await app.inject({
      method: 'POST',
      url: `/spots/${fushimi}/comments`,
      headers,
      payload: { body: 'Early' },
    })
    const id = created.json().id as string
    await app.inject({
      method: 'PATCH',
      url: `/comments/${id}`,
      headers,
      payload: { body: 'Very early' },
    })
    await app.inject({
      method: 'PUT',
      url: `/spots/${fushimi}/comments/read`,
      headers,
      payload: { upTo: new Date().toISOString() },
    })
    await app.inject({
      method: 'DELETE',
      url: `/comments/${id}`,
      headers: { cookie: aiko, origin: WEB_ORIGIN },
    })

    const deadline = Date.now() + 4000
    while (
      text.split('"resource":"comment"').length - 1 < 3 &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
    await reader.cancel()
    await pump.catch(() => {})

    const events = text
      .split('\n\n')
      .filter((block) => block.includes('"resource":"comment"'))
    expect(events).toHaveLength(3)
    for (const block of events) {
      expect(block).toContain('event: change')
      expect(block).toContain(`"id":"${fushimi}"`)
    }
    expect(
      events.map((block) => /"action":"([^"]+)"/.exec(block)?.[1]),
    ).toEqual(['comment.create', 'comment.update', 'comment.delete'])
  })
})
