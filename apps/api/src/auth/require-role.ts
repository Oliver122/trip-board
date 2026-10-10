import type { MeResponse } from '@tripboard/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { readCookie, SESSION_COOKIE, sessionCookie } from './cookies.js'
import { authenticate } from './login.js'
import { sendError } from '../http/errors.js'

export async function requireAppRole(
  request: FastifyRequest,
  reply: FastifyReply,
  pool: Pool,
  now: Date,
  secure: boolean,
  role: 'admin',
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
  if (session.user.appRole !== role) {
    sendError(reply, 404, 'not_found')
    return null
  }
  return session.user
}
