import type { LightMyRequestResponse } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig } from '../config.js'
import { seedDatabase, seedIds } from '../db/seed.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { hashSessionToken } from './login.js'

const DAY = 24 * 60 * 60 * 1000
const WEB_ORIGIN = 'http://127.0.0.1:5180'
const SVEN = '100000000000000001'
const AIKO = '100000000000000002'
const TOM = '100000000000000003'

describe('dev login', () => {
  let db: TestDatabase
  let hiddenUnset: FastifyInstance
  let hiddenZero: FastifyInstance
  let app: FastifyInstance
  let promoted: FastifyInstance
  const now = new Date('2026-06-01T00:00:00.000Z')

  beforeAll(async () => {
    db = await createTestDatabase()
    await seedDatabase(db.pool)
    const base = {
      DATABASE_URL: db.url,
      NODE_ENV: 'test' as const,
      WEB_ORIGIN,
      DISCORD_CLIENT_ID: 'client-123',
      DISCORD_CLIENT_SECRET: 'secret-456',
      AUTH_SECRET: 'test-auth-secret-value',
    }
    hiddenUnset = await buildApp(db.pool, {
      config: loadConfig(base),
      now: () => now,
    })
    hiddenZero = await buildApp(db.pool, {
      config: loadConfig({ ...base, DEV_LOGIN: '0' }),
      now: () => now,
    })
    app = await buildApp(db.pool, {
      config: loadConfig({ ...base, DEV_LOGIN: '1' }),
      now: () => now,
    })
    promoted = await buildApp(db.pool, {
      config: loadConfig({
        ...base,
        DEV_LOGIN: '1',
        ADMIN_DISCORD_IDS: TOM,
      }),
      now: () => now,
    })
  })

  afterAll(async () => {
    await hiddenUnset?.close()
    await hiddenZero?.close()
    await app?.close()
    await promoted?.close()
    if (!db) return
    await db.pool.end()
    await db.drop()
  })

  it('T-22-01 hides the routes when DEV_LOGIN is off', async () => {
    for (const target of [hiddenUnset, hiddenZero]) {
      const before = await sessionCount()
      const listed = await target.inject({
        method: 'GET',
        url: '/auth/dev/users',
      })
      const loggedIn = await target.inject({
        method: 'POST',
        url: '/auth/dev/login',
        headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
        payload: { discordId: SVEN },
      })
      expect(listed.statusCode).toBe(404)
      expect(loggedIn.statusCode).toBe(404)
      expect(await sessionCount()).toBe(before)
    }
  })

  it('T-22-04 lists the seeded users without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/auth/dev/users' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      users: [
        {
          discordId: SVEN,
          username: 'sven',
          displayName: 'Sven',
          appRole: 'admin',
        },
        {
          discordId: AIKO,
          username: 'aiko',
          displayName: 'Aiko',
          appRole: 'user',
        },
        {
          discordId: TOM,
          username: 'tom',
          displayName: 'Tom',
          appRole: 'user',
        },
      ],
    })
  })

  it('T-22-05 logs in as Sven and records the same session and activity as Discord', async () => {
    const before = await loginEventCount(seedIds.users.sven)
    const response = await app.inject({
      method: 'POST',
      url: '/auth/dev/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId: SVEN },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      id: seedIds.users.sven,
      discordId: SVEN,
      username: 'sven',
      displayName: 'Sven',
      locale: 'en',
      appRole: 'admin',
    })
    const cookie = headerCookies(response).find((value) =>
      value.startsWith('tb_session='),
    )
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Lax/)
    expect(cookie).toMatch(/Max-Age=2592000/)
    const token = cookieValue(cookie ?? '')
    const sessions = await db.pool.query<{ id: string; expires_at: Date }>(
      'SELECT id, expires_at FROM sessions WHERE user_id = $1',
      [seedIds.users.sven],
    )
    expect(sessions.rows).toHaveLength(1)
    expect(sessions.rows[0]?.id).toBe(hashSessionToken(token))
    expect(new Date(sessions.rows[0]?.expires_at ?? 0).toISOString()).toBe(
      new Date(now.getTime() + 30 * DAY).toISOString(),
    )
    const user = await db.pool.query<{ last_login_at: Date }>(
      'SELECT last_login_at FROM users WHERE id = $1',
      [seedIds.users.sven],
    )
    expect(new Date(user.rows[0]?.last_login_at ?? 0).toISOString()).toBe(
      now.toISOString(),
    )
    expect(await loginEventCount(seedIds.users.sven)).toBe(before + 1)

    const admin = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { cookie: sessionHeader(response) },
    })
    expect(admin.statusCode).toBe(200)
  })

  it('T-22-06 rejects a bad id, an unknown user, a suspended user, and a foreign origin', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/auth/dev/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId: 'abc' },
    })
    expect(invalid.statusCode).toBe(400)

    const beforeUsers = await userCount()
    const beforeSessions = await sessionCount()
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/dev/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId: '100000000000009999' },
    })
    expect(unknown.statusCode).toBe(404)
    expect(await userCount()).toBe(beforeUsers)
    expect(await sessionCount()).toBe(beforeSessions)

    await db.pool.query(
      `
      UPDATE users
      SET suspended_at = $2, suspended_reason = 'spam'
      WHERE discord_id = $1
      `,
      [AIKO, now],
    )
    const suspended = await app.inject({
      method: 'POST',
      url: '/auth/dev/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId: AIKO },
    })
    expect(suspended.statusCode).toBe(403)
    expect(suspended.json()).toMatchObject({ reason: 'spam' })
    const aikoSessions = await db.pool.query<{ n: number }>(
      `
      SELECT count(*)::int AS n
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE u.discord_id = $1
      `,
      [AIKO],
    )
    expect(aikoSessions.rows[0]?.n).toBe(0)
    await db.pool.query(
      `
      UPDATE users
      SET suspended_at = NULL, suspended_reason = NULL
      WHERE discord_id = $1
      `,
      [AIKO],
    )

    for (const origin of [undefined, 'https://evil.com']) {
      const before = await sessionCount()
      const response = await app.inject({
        method: 'POST',
        url: '/auth/dev/login',
        headers: {
          ...(origin ? { origin } : {}),
          'content-type': 'application/json',
        },
        payload: { discordId: SVEN },
      })
      expect(response.statusCode).toBe(403)
      expect(await sessionCount()).toBe(before)
    }
  })

  it('T-22-07 promotes a listed Discord id on dev login', async () => {
    const response = await promoted.inject({
      method: 'POST',
      url: '/auth/dev/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId: TOM },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      discordId: TOM,
      username: 'tom',
      appRole: 'admin',
    })
    await db.pool.query(
      `UPDATE users SET app_role = 'user' WHERE discord_id = $1`,
      [TOM],
    )
  })

  async function sessionCount() {
    const result = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM sessions',
    )
    return result.rows[0]?.n ?? 0
  }

  async function userCount() {
    const result = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM users',
    )
    return result.rows[0]?.n ?? 0
  }

  async function loginEventCount(actorId: string) {
    const result = await db.pool.query<{ n: number }>(
      `
      SELECT count(*)::int AS n
      FROM activity_events
      WHERE actor_id = $1 AND action = 'user.login'
      `,
      [actorId],
    )
    return result.rows[0]?.n ?? 0
  }
})

function headerCookies(response: LightMyRequestResponse): string[] {
  const raw = response.headers['set-cookie']
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

function cookieValue(setCookie: string): string {
  const pair = setCookie.split(';')[0] ?? ''
  return pair.slice(pair.indexOf('=') + 1)
}

function sessionHeader(response: LightMyRequestResponse): string {
  const cookie = headerCookies(response).find((value) =>
    value.startsWith('tb_session='),
  )
  return `tb_session=${cookieValue(cookie ?? '')}`
}
