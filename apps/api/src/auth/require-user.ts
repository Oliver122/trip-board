import type { MeResponse } from '@tripboard/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import type { AppConfig } from '../config.js'
import { readCookie, SESSION_COOKIE, sessionCookie } from './cookies.js'
import { authenticate } from './login.js'
import { sendError } from '../http/errors.js'

export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  pool: Pool,
  now: Date,
  secure: boolean,
): Promise<MeResponse | null> {
  const token = readCookie(request.headers.cookie, SESSION_COOKIE)
  if (!token) {
    sendError(reply, 401, 'unauthenticated')
    return null
  }
  const session = await authenticate(pool, token, now)
  if (!session) {
    sendError(reply, 401, 'unauthenticated')
    return null
  }
  if (session.slid) reply.header('set-cookie', sessionCookie(token, secure))
  return session.user
}

export function originAllowed(
  request: FastifyRequest,
  config: AppConfig,
): boolean {
  return request.headers.origin === config.WEB_ORIGIN
}
