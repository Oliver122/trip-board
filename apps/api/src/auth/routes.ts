import { meResponseSchema, safeNextPath } from '@tripboard/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { AppConfig } from '../config.js'
import {
  OAUTH_COOKIE,
  OAUTH_TTL_MS,
  SESSION_COOKIE,
  clearCookie,
  oauthCookie,
  readCookie,
  readOAuthState,
  sessionCookie,
  signOAuthState,
} from './cookies.js'
import {
  discordAuthorizeUrl,
  fetchDiscordProfile,
  newOAuthSecrets,
} from './discord.js'
import {
  authenticate,
  deleteSession,
  loginForTest,
  loginWithDiscord,
  updateLocale,
} from './login.js'

export type AuthRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
}

const startQuery = z.object({
  next: z.string().optional(),
})

const callbackQuery = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
})

const testLoginBody = z.object({
  discordId: z.string().regex(/^[0-9]{5,25}$/),
})

const patchMeBody = z
  .object({
    locale: z.enum(['en', 'de']),
  })
  .strict()

export function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthRouteOptions,
): void {
  const { pool, config, now } = options
  const secure = config.NODE_ENV === 'production'

  app.get('/auth/discord', async (request, reply) => {
    const query = startQuery.safeParse(request.query)
    if (!query.success)
      return reply.code(400).send({ error: 'invalid_request' })
    const next = safeNextPath(query.data.next)
    const secrets = newOAuthSecrets()
    const exp = now().getTime() + OAUTH_TTL_MS
    const signed = signOAuthState(
      { state: secrets.state, verifier: secrets.verifier, next, exp },
      config.AUTH_SECRET,
    )
    return redirect(
      reply,
      discordAuthorizeUrl(config, secrets.state, secrets.verifier),
      [oauthCookie(signed, secure)],
    )
  })

  app.get('/auth/discord/callback', async (request, reply) => {
    const query = callbackQuery.safeParse(request.query)
    if (!query.success)
      return reply.code(400).send({ error: 'invalid_request' })
    const clearState = clearCookie(OAUTH_COOKIE, secure)

    if (query.data.error) {
      const code =
        query.data.error === 'access_denied'
          ? 'access_denied'
          : 'discord_unavailable'
      return redirect(reply, loginUrl(config, { error: code }), [clearState])
    }

    const rawState = readCookie(request.headers.cookie, OAUTH_COOKIE)
    const payload = rawState
      ? readOAuthState(rawState, config.AUTH_SECRET, now().getTime())
      : null
    if (
      !payload ||
      !query.data.code ||
      !query.data.state ||
      payload.state !== query.data.state
    ) {
      reply.header('set-cookie', clearState)
      return reply.code(400).send({ error: 'invalid_request' })
    }

    let profile
    try {
      profile = await fetchDiscordProfile(
        config,
        query.data.code,
        payload.verifier,
      )
    } catch {
      return redirect(
        reply,
        loginUrl(config, { error: 'discord_unavailable' }),
        [clearState],
      )
    }

    const result = await loginWithDiscord(
      pool,
      config,
      profile,
      payload.next,
      now(),
      userAgent(request),
    )
    if (result.kind === 'suspended') {
      return redirect(
        reply,
        loginUrl(config, {
          error: 'suspended',
          reason: result.reason ?? '',
        }),
        [clearState],
      )
    }
    if (result.kind === 'signups_disabled') {
      return redirect(reply, loginUrl(config, { error: 'signups_disabled' }), [
        clearState,
      ])
    }
    return redirect(reply, `${config.WEB_ORIGIN}${result.next}`, [
      clearState,
      sessionCookie(result.token, secure),
    ])
  })

  app.get('/me', async (request, reply) => {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE)
    if (!token) return reply.code(401).send({ error: 'unauthenticated' })
    const session = await authenticate(pool, token, now())
    if (!session) return reply.code(401).send({ error: 'unauthenticated' })
    if (session.slid) reply.header('set-cookie', sessionCookie(token, secure))
    return meResponseSchema.parse(session.user)
  })

  app.patch('/me', async (request, reply) => {
    if (!originAllowed(request, config)) {
      return reply.code(403).send({ error: 'forbidden_origin' })
    }
    const token = readCookie(request.headers.cookie, SESSION_COOKIE)
    if (!token) return reply.code(401).send({ error: 'unauthenticated' })
    const session = await authenticate(pool, token, now())
    if (!session) return reply.code(401).send({ error: 'unauthenticated' })
    const body = patchMeBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' })
    const user = await updateLocale(
      pool,
      session.user.id,
      body.data.locale,
      now(),
    )
    if (!user) return reply.code(404).send({ error: 'not_found' })
    if (session.slid) reply.header('set-cookie', sessionCookie(token, secure))
    return meResponseSchema.parse(user)
  })

  app.post('/auth/logout', async (request, reply) => {
    if (!originAllowed(request, config)) {
      return reply.code(403).send({ error: 'forbidden_origin' })
    }
    const token = readCookie(request.headers.cookie, SESSION_COOKIE)
    if (!token || !(await deleteSession(pool, token))) {
      reply.header('set-cookie', clearCookie(SESSION_COOKIE, secure))
      return reply.code(401).send({ error: 'unauthenticated' })
    }
    reply.header('set-cookie', clearCookie(SESSION_COOKIE, secure))
    return reply.code(204).send()
  })

  if (config.NODE_ENV === 'test') {
    app.post('/test/login', async (request, reply) => {
      if (!originAllowed(request, config)) {
        return reply.code(403).send({ error: 'forbidden_origin' })
      }
      const body = testLoginBody.safeParse(request.body)
      if (!body.success)
        return reply.code(400).send({ error: 'invalid_request' })
      const result = await loginForTest(
        pool,
        body.data.discordId,
        now(),
        userAgent(request),
      )
      if (result.kind === 'suspended') {
        return reply.code(403).send({
          error: 'suspended',
          reason: result.reason,
        })
      }
      reply.header('set-cookie', sessionCookie(result.token, secure))
      return meResponseSchema.parse(result.user)
    })
  }
}

function originAllowed(request: FastifyRequest, config: AppConfig): boolean {
  return request.headers.origin === config.WEB_ORIGIN
}

function userAgent(request: FastifyRequest): string | null {
  const value = request.headers['user-agent']
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null
  return raw.slice(0, 500)
}

function loginUrl(config: AppConfig, params: Record<string, string>): string {
  const search = new URLSearchParams(params)
  return `${config.WEB_ORIGIN}/login?${search.toString()}`
}

function redirect(reply: FastifyReply, location: string, cookies: string[]) {
  if (cookies.length === 1) reply.header('set-cookie', cookies[0])
  else if (cookies.length > 1) reply.header('set-cookie', cookies)
  return reply.redirect(location, 302)
}
