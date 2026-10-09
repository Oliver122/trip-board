import { commentBodySchema, commentReadSchema } from '@tripboard/shared'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { originAllowed, requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import { deny, parseBody } from '../http/validate.js'
import { CommentLimiter } from './limit.js'
import {
  createComment,
  decodeCursor,
  deleteComment,
  listComments,
  listNews,
  markSpotRead,
  markTripRead,
  updateComment,
} from './store.js'
import { sendError } from '../http/errors.js'
import { idParams, parseParams } from '../http/params.js'

export type CommentRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
  limiter?: CommentLimiter
}

const knownMessages = new Set(['empty', 'too_long', 'invalid'])

const cursorSchema = z.object({
  cursor: z.string().optional(),
})

export function registerCommentRoutes(
  app: FastifyInstance,
  options: CommentRouteOptions,
): void {
  const { pool, config, now } = options
  const limiter = options.limiter ?? new CommentLimiter()
  const secure = config.NODE_ENV === 'production'

  app.get('/spots/:id/comments', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const query = cursorSchema.safeParse(request.query)
    if (!query.success) return invalidRequest(reply, 'cursor')
    let cursor = null
    if (query.data.cursor !== undefined) {
      cursor = decodeCursor(query.data.cursor)
      if (!cursor) return invalidRequest(reply, 'cursor')
    }
    const result = await listComments(pool, params.id, user.id, cursor)
    if (!result.ok) return deny(reply, result.status)
    return result.list
  })

  app.post('/spots/:id/comments', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const input = parseBody(
      commentBodySchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const decision = limiter.check(user.id, now())
    if (!decision.ok) {
      reply.header('retry-after', String(decision.retryAfter))
      return sendError(reply, 429, 'rate_limited')
    }
    const result = await createComment(pool, user.id, params.id, input.body)
    if (!result.ok) return deny(reply, result.status)
    return reply.code(201).send(result.comment)
  })

  app.patch('/comments/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const input = parseBody(
      commentBodySchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const result = await updateComment(pool, user.id, params.id, input.body)
    if (!result.ok) return deny(reply, result.status)
    return result.comment
  })

  app.delete('/comments/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const result = await deleteComment(pool, user.id, params.id)
    if (!result.ok) return deny(reply, result.status)
    return reply.code(204).send()
  })

  app.put('/spots/:id/comments/read', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const input = parseBody(
      commentReadSchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const result = await markSpotRead(pool, user.id, params.id, input.upTo)
    if (!result.ok) return deny(reply, result.status)
    return reply.code(204).send()
  })

  app.get('/trips/:id/news', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const result = await listNews(pool, params.id, user.id)
    if (!result.ok) return deny(reply, result.status)
    return result.news
  })

  app.post('/trips/:id/news/read', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const result = await markTripRead(pool, user.id, params.id)
    if (!result.ok) return deny(reply, result.status)
    return reply.code(204).send()
  })
}

function invalidRequest(reply: FastifyReply, field: string) {
  return sendError(reply, 400, 'invalid_request', {
    fields: { [field]: 'invalid' },
  })
}
