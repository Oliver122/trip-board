import type { MeResponse } from '@tripboard/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { readCookie, SESSION_COOKIE, sessionCookie } from './cookies.js'
import { authenticate } from './login.js'

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
    reply.code(401).send({ error: 'unauthenticated' })
    return null
  }
  const session = await authenticate(pool, token, now)
  if (!session) {
    reply.code(401).send({ error: 'unauthenticated' })
    return null
  }
  if (session.slid) reply.header('set-cookie', sessionCookie(token, secure))
  if (session.user.appRole !== role) {
    reply.code(404).send({ error: 'not_found' })
    return null
  }
  return session.user
}
