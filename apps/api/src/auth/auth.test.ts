import type { LightMyRequestResponse } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { codeChallenge } from './discord.js'
import { startFakeDiscord, type FakeDiscord } from './fake-discord.js'
import { readOAuthState } from './cookies.js'
import { hashSessionToken } from './login.js'

const DAY = 24 * 60 * 60 * 1000
const WEB_ORIGIN = 'http://127.0.0.1:5180'

describe('discord auth', () => {
  let db: TestDatabase
  let fake: FakeDiscord
  let app: FastifyInstance
  let config: AppConfig
  let now = new Date('2026-06-01T00:00:00.000Z')

  beforeAll(async () => {
    db = await createTestDatabase()
    fake = await startFakeDiscord()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
      DISCORD_CLIENT_ID: 'client-123',
      DISCORD_CLIENT_SECRET: 'secret-456',
      AUTH_SECRET: 'test-auth-secret-value',
      DISCORD_API_ORIGIN: fake.origin,
    })
    app = await buildApp(db.pool, { config, now: () => now })
  })

  afterAll(async () => {
    await app.close()
    await fake.close()
    await db.drop()
  })

  beforeEach(async () => {
    now = new Date('2026-06-01T00:00:00.000Z')
    await db.pool.query('UPDATE app_settings SET signups_enabled = true')
  })

  it('T-02-01 redirects to Discord with PKCE and stores state', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/discord?next=/trips',
    })
    expect(response.statusCode).toBe(302)
    const location = new URL(String(response.headers.location))
    expect(location.origin).toBe(fake.origin)
    expect(location.pathname).toBe('/oauth2/authorize')
    expect(location.searchParams.get('client_id')).toBe('client-123')
    expect(location.searchParams.get('scope')).toBe('identify')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    const state = location.searchParams.get('state')
    const challenge = location.searchParams.get('code_challenge')
    expect(state).toBeTruthy()
    expect(challenge).toBeTruthy()

    const cookie = headerCookies(response).find((value) =>
      value.startsWith('tb_oauth='),
    )
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Lax/)
    const payload = readOAuthState(
      cookieValue(cookie ?? ''),
      config.AUTH_SECRET,
      now.getTime(),
    )
    expect(payload?.state).toBe(state)
    expect(payload?.next).toBe('/trips')
    expect(codeChallenge(payload?.verifier ?? '')).toBe(challenge)
  })

  it('T-02-02 creates the user and stores only the session hash', async () => {
    const profile = {
      id: '100000000000000102',
      username: 'aiko',
      globalName: 'Aiko',
      avatar: 'abc123',
    }
    const response = await finishLogin(profile, 'code-102')
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe(`${WEB_ORIGIN}/trips`)

    const session = headerCookies(response).find((value) =>
      value.startsWith('tb_session='),
    )
    expect(session).toMatch(/HttpOnly/)
    expect(session).toMatch(/SameSite=Lax/)
    expect(session).not.toMatch(/Secure/)
    const token = cookieValue(session ?? '')
    const rows = await db.pool.query<{
      id: string
      username: string
      avatar_url: string
    }>('SELECT id, username, avatar_url FROM users WHERE discord_id = $1', [
      profile.id,
    ])
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]?.username).toBe('aiko')
    expect(rows.rows[0]?.avatar_url).toBe(
      'https://cdn.discordapp.com/avatars/100000000000000102/abc123.png',
    )
    const sessions = await db.pool.query<{ id: string }>(
      'SELECT id FROM sessions WHERE user_id = $1',
      [rows.rows[0]?.id],
    )
    expect(sessions.rows[0]?.id).toMatch(/^[0-9a-f]{64}$/)
    expect(sessions.rows[0]?.id).not.toBe(token)
    expect(sessions.rows[0]?.id).toBe(hashSessionToken(token))
  })

  it('T-02-03 updates the same user when Discord renames them', async () => {
    const id = '100000000000000103'
    await finishLogin(
      { id, username: 'oldname', globalName: 'Old', avatar: null },
      'code-103a',
    )
    const first = await db.pool.query<{ id: string }>(
      'SELECT id FROM users WHERE discord_id = $1',
      [id],
    )
    await finishLogin(
      { id, username: 'newname', globalName: 'New', avatar: null },
      'code-103b',
    )
    const rows = await db.pool.query<{ id: string; username: string }>(
      'SELECT id, username FROM users WHERE discord_id = $1',
      [id],
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]?.id).toBe(first.rows[0]?.id)
    expect(rows.rows[0]?.username).toBe('newname')
  })

  it('T-02-04 rejects a callback with the wrong or missing state', async () => {
    const before = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM sessions',
    )
    const started = await app.inject({ method: 'GET', url: '/auth/discord' })
    const oauth = headerCookies(started).find((value) =>
      value.startsWith('tb_oauth='),
    )
    const wrong = await app.inject({
      method: 'GET',
      url: '/auth/discord/callback?code=nope&state=not-the-state',
      headers: { cookie: `tb_oauth=${cookieValue(oauth ?? '')}` },
    })
    expect(wrong.statusCode).toBe(400)
    const missing = await app.inject({
      method: 'GET',
      url: '/auth/discord/callback?code=nope&state=anything',
    })
    expect(missing.statusCode).toBe(400)
    const after = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM sessions',
    )
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n)
  })

  it('T-02-05 sends open redirects to /trips', async () => {
    for (const next of ['https://evil.com', '//evil.com']) {
      const response = await finishLogin(
        {
          id: next.startsWith('http')
            ? '100000000000000105'
            : '100000000000000106',
          username: 'safe',
          globalName: null,
          avatar: null,
        },
        `code-${next.length}`,
        next,
      )
      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe(`${WEB_ORIGIN}/trips`)
      expect(String(response.headers.location)).not.toContain('evil.com')
    }
  })

  it('T-02-06 extends a day-16 session and rejects a day-31 session', async () => {
    const start = new Date('2026-06-01T00:00:00.000Z')
    now = start
    const sliding = await finishLogin(
      {
        id: '100000000000000107',
        username: 'slide',
        globalName: null,
        avatar: null,
      },
      'code-107',
    )
    const slidingCookie = sessionHeader(sliding)
    now = new Date(start.getTime() + 16 * DAY)
    const extended = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: slidingCookie },
    })
    expect(extended.statusCode).toBe(200)
    const expires = await db.pool.query<{ expires_at: Date }>(
      `
      SELECT s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE u.discord_id = '100000000000000107'
      ORDER BY s.created_at DESC
      LIMIT 1
      `,
    )
    expect(new Date(expires.rows[0]?.expires_at ?? 0).getTime()).toBe(
      now.getTime() + 30 * DAY,
    )

    now = start
    const expiring = await finishLogin(
      {
        id: '100000000000000108',
        username: 'expire',
        globalName: null,
        avatar: null,
      },
      'code-108',
    )
    now = new Date(start.getTime() + 31 * DAY)
    const rejected = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: sessionHeader(expiring) },
    })
    expect(rejected.statusCode).toBe(401)
  })

  it('T-02-07 rejects /me without a cookie and after logout', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/me' })
    expect(anonymous.statusCode).toBe(401)

    const loggedIn = await finishLogin(
      {
        id: '100000000000000109',
        username: 'logout',
        globalName: null,
        avatar: null,
      },
      'code-109',
    )
    const cookie = sessionHeader(loggedIn)
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ username: 'logout' })

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie, origin: WEB_ORIGIN },
    })
    expect(logout.statusCode).toBe(204)
    expect(headerCookies(logout).join(';')).toMatch(/tb_session=;/)
    const again = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie },
    })
    expect(again.statusCode).toBe(401)
  })

  it('T-02-08 rejects logout from a foreign origin', async () => {
    const loggedIn = await finishLogin(
      {
        id: '100000000000000110',
        username: 'csrf',
        globalName: null,
        avatar: null,
      },
      'code-110',
    )
    const cookie = sessionHeader(loggedIn)
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie, origin: 'https://evil.com' },
    })
    expect(response.statusCode).toBe(403)
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie },
    })
    expect(me.statusCode).toBe(200)
  })

  it('T-02-12 blocks suspended users and closed signups, except a valid invite', async () => {
    await db.pool.query(
      `
      INSERT INTO users (discord_id, username, suspended_at, suspended_reason)
      VALUES ('100000000000000111', 'banned', now(), 'spam')
      `,
    )
    const suspended = await finishLogin(
      {
        id: '100000000000000111',
        username: 'banned',
        globalName: null,
        avatar: null,
      },
      'code-111',
    )
    const suspendedUrl = new URL(String(suspended.headers.location))
    expect(suspendedUrl.pathname).toBe('/login')
    expect(suspendedUrl.searchParams.get('error')).toBe('suspended')
    expect(suspendedUrl.searchParams.get('reason')).toBe('spam')
    expect(await sessionCount('100000000000000111')).toBe(0)

    await db.pool.query('UPDATE app_settings SET signups_enabled = false')
    const before = await userCount()
    const refused = await finishLogin(
      {
        id: '100000000000000112',
        username: 'newbie',
        globalName: null,
        avatar: null,
      },
      'code-112',
    )
    expect(
      new URL(String(refused.headers.location)).searchParams.get('error'),
    ).toBe('signups_disabled')
    expect(await userCount()).toBe(before)
    expect(await sessionCount('100000000000000112')).toBe(0)

    await db.pool.query(
      `
      INSERT INTO users (discord_id, username)
      VALUES ('100000000000000113', 'member')
      `,
    )
    const existing = await finishLogin(
      {
        id: '100000000000000113',
        username: 'member',
        globalName: null,
        avatar: null,
      },
      'code-113',
    )
    expect(existing.headers.location).toBe(`${WEB_ORIGIN}/trips`)
    expect(await sessionCount('100000000000000113')).toBe(1)

    await insertInvite(db)
    const invited = await finishLogin(
      {
        id: '100000000000000114',
        username: 'guest',
        globalName: null,
        avatar: null,
      },
      'code-114',
      '/join/JPN-7K3Q',
    )
    expect(invited.headers.location).toBe(`${WEB_ORIGIN}/join/JPN-7K3Q`)
    expect(await sessionCount('100000000000000114')).toBe(1)
  })

  it('T-02-13 writes one login event and touches last_seen_at once', async () => {
    const id = '100000000000000115'
    const loggedIn = await finishLogin(
      { id, username: 'seen', globalName: null, avatar: null },
      'code-115',
    )
    const session = sessionHeader(loggedIn)
    const user = await db.pool.query<{ id: string; last_seen_at: Date | null }>(
      'SELECT id, last_seen_at FROM users WHERE discord_id = $1',
      [id],
    )
    expect(user.rows[0]?.last_seen_at).toBeNull()
    const events = await db.pool.query<{ n: number }>(
      `
      SELECT count(*)::int AS n
      FROM activity_events
      WHERE actor_id = $1 AND action = 'user.login'
      `,
      [user.rows[0]?.id],
    )
    expect(events.rows[0]?.n).toBe(1)
    let stamp = ''
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const me = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { cookie: session },
      })
      expect(me.statusCode).toBe(200)
      const seen = await db.pool.query<{ last_seen_at: Date }>(
        'SELECT last_seen_at FROM users WHERE discord_id = $1',
        [id],
      )
      const value = new Date(seen.rows[0]?.last_seen_at ?? 0).toISOString()
      if (attempt === 0) stamp = value
      else expect(value).toBe(stamp)
    }
    const after = await db.pool.query<{ n: number }>(
      `
      SELECT count(*)::int AS n
      FROM activity_events
      WHERE actor_id = $1 AND action = 'user.login'
      `,
      [user.rows[0]?.id],
    )
    expect(after.rows[0]?.n).toBe(1)
  })

  it('sets a Secure cookie in production and hides test login', async () => {
    const prodConfig = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'production',
      WEB_ORIGIN,
      DISCORD_CLIENT_ID: 'client-123',
      DISCORD_CLIENT_SECRET: 'secret-456',
      AUTH_SECRET: 'test-auth-secret-value',
      DISCORD_API_ORIGIN: fake.origin,
      S3_ENDPOINT: 'http://localhost:9000',
      S3_BUCKET: 'tripboard',
      S3_ACCESS_KEY: 'tripboard',
      S3_SECRET_KEY: 'tripboard-secret',
    })
    const prod = await buildApp(db.pool, { config: prodConfig, now: () => now })
    try {
      const hidden = await prod.inject({
        method: 'POST',
        url: '/test/login',
        headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
        payload: { discordId: '100000000000000117' },
      })
      expect(hidden.statusCode).toBe(404)
      const response = await finishLogin(
        {
          id: '100000000000000117',
          username: 'secure',
          globalName: null,
          avatar: null,
        },
        'code-117',
        undefined,
        prod,
      )
      const session = headerCookies(response).find((value) =>
        value.startsWith('tb_session='),
      )
      expect(session).toMatch(/Secure/)
    } finally {
      await prod.close()
    }
  })

  it('T-03-04 stores a supported locale and rejects others', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId: '100000000000000303' },
    })
    expect(login.statusCode).toBe(200)
    const cookie = sessionHeader(login)

    const missing = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { locale: 'de' },
    })
    expect(missing.statusCode).toBe(401)

    const foreign = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: {
        cookie,
        origin: 'https://evil.com',
        'content-type': 'application/json',
      },
      payload: { locale: 'de' },
    })
    expect(foreign.statusCode).toBe(403)

    const invalid = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: {
        cookie,
        origin: WEB_ORIGIN,
        'content-type': 'application/json',
      },
      payload: { locale: 'fr' },
    })
    expect(invalid.statusCode).toBe(400)

    const updated = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: {
        cookie,
        origin: WEB_ORIGIN,
        'content-type': 'application/json',
      },
      payload: { locale: 'de' },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toMatchObject({ locale: 'de' })

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ locale: 'de' })

    const stored = await db.pool.query<{ locale: string }>(
      'SELECT locale FROM users WHERE discord_id = $1',
      ['100000000000000303'],
    )
    expect(stored.rows[0]?.locale).toBe('de')
  })

  it('POST /test/login creates a session for end-to-end tests', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId: '100000000000000116' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ username: 'u100000000000000116' })
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: sessionHeader(response) },
    })
    expect(me.statusCode).toBe(200)

    const invalid = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId: 'nope' },
    })
    expect(invalid.statusCode).toBe(400)
    const foreign = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: {
        origin: 'https://evil.com',
        'content-type': 'application/json',
      },
      payload: { discordId: '100000000000000118' },
    })
    expect(foreign.statusCode).toBe(403)
  })

  async function finishLogin(
    profile: {
      id: string
      username: string
      globalName: string | null
      avatar: string | null
    },
    code: string,
    next?: string,
    target: FastifyInstance = app,
  ) {
    const start = await target.inject({
      method: 'GET',
      url: next
        ? `/auth/discord?next=${encodeURIComponent(next)}`
        : '/auth/discord',
    })
    const location = new URL(String(start.headers.location))
    const oauth = headerCookies(start).find((value) =>
      value.startsWith('tb_oauth='),
    )
    fake.issue(code, profile)
    return target.inject({
      method: 'GET',
      url: `/auth/discord/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(location.searchParams.get('state') ?? '')}`,
      headers: { cookie: `tb_oauth=${cookieValue(oauth ?? '')}` },
    })
  }

  async function sessionCount(discordId: string) {
    const result = await db.pool.query<{ n: number }>(
      `
      SELECT count(*)::int AS n
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE u.discord_id = $1
      `,
      [discordId],
    )
    return result.rows[0]?.n ?? 0
  }

  async function userCount() {
    const result = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM users',
    )
    return result.rows[0]?.n ?? 0
  }
})

async function insertInvite(db: TestDatabase) {
  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')
    const owner = await client.query<{ id: string }>(
      `
      INSERT INTO users (discord_id, username)
      VALUES ('100000000000000201', 'owner')
      RETURNING id
      `,
    )
    const trip = await client.query<{ id: string }>(
      `
      INSERT INTO trips (
        name, created_by, timezone,
        bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat
      ) VALUES ('Japan', $1, 'Asia/Tokyo', 122.9, 24, 153.9, 45.6)
      RETURNING id
      `,
      [owner.rows[0]?.id],
    )
    await client.query(
      `
      INSERT INTO trip_members (trip_id, user_id, role)
      VALUES ($1, $2, 'owner')
      `,
      [trip.rows[0]?.id, owner.rows[0]?.id],
    )
    await client.query(
      `
      INSERT INTO trip_invites (trip_id, code, role, created_by, expires_at)
      VALUES ($1, 'JPN-7K3Q', 'visitor', $2, now() + interval '3 days')
      `,
      [trip.rows[0]?.id, owner.rows[0]?.id],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

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
