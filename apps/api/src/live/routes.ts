import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Pool } from 'pg'
import { readCookie, SESSION_COOKIE } from '../auth/cookies.js'
import { requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import { deny } from '../http/validate.js'
import { requireTripRole } from '../trips/roles.js'
import type { TripHub } from './hub.js'
import { sendError } from '../http/errors.js'
import { idParams, parseParams } from '../http/params.js'

export function registerLiveRoutes(
  app: FastifyInstance,
  options: {
    pool: Pool
    config: AppConfig
    now: () => Date
    hub: TripHub
  },
): void {
  const { pool, config, now, hub } = options
  const secure = config.NODE_ENV === 'production'

  app.get('/trips/:id/events', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const access = await requireTripRole(pool, params.id, user.id, 'visitor')
    if (!access.ok) return deny(reply, access.status)
    const token = readCookie(request.headers.cookie, SESSION_COOKIE)
    if (!token) return sendError(reply, 401, 'unauthenticated')
    const lastHeader = request.headers['last-event-id']
    const lastEventId =
      typeof lastHeader === 'string' && lastHeader.length > 0
        ? lastHeader
        : null
    const opened = hub.reserve({
      tripId: params.id,
      userId: user.id,
      token,
      pool,
      lastEventId,
      write: (chunk) => {
        reply.raw.write(chunk)
      },
      finish: () => {
        if (!reply.raw.writableEnded) reply.raw.end()
      },
    })
    if (!opened.ok) {
      return sendError(reply, 429, 'too_many_streams')
    }

    reply.hijack()
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    opened.start()
    const socket = reply.raw.socket
    socket?.on('close', () => {
      opened.release()
    })
  })
}

export function isLiveEvents(url: string): boolean {
  return /\/trips\/[^/]+\/events(?:\?|$)/.test(url)
}

export function invalidExpected(reply: FastifyReply) {
  return sendError(reply, 400, 'invalid_request', {
    fields: { expectedUpdatedAt: 'invalid' },
  })
}
