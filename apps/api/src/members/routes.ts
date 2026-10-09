import {
  createInviteSchema,
  inviteCodePattern,
  inviteListSchema,
  joinPreviewSchema,
  joinResultSchema,
  memberListSchema,
  memberSchema,
  patchMemberSchema,
  transferOwnershipSchema,
} from '@tripboard/shared'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { originAllowed, requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import { deny, parseBody } from '../http/validate.js'
import { isPreviewBot, joinPreviewHtml } from './html.js'
import { JoinLimiter } from './limit.js'
import {
  createInvite,
  joinTrip,
  leaveTrip,
  listInvites,
  listMembers,
  previewInvite,
  removeMember,
  revokeInvite,
  transferOwnership,
  updateMemberRole,
  type MemberFailure,
} from './store.js'
import { sendError } from '../http/errors.js'
import { idUserParams, parseParams } from '../http/params.js'

export type MemberRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
  limiter: JoinLimiter
}

const knownMessages = new Set([
  'invalid',
  'not_member',
  'already_owner',
  'owner',
])

const idSchema = z.object({
  id: z.string().uuid({ message: 'invalid' }),
})

const codeParams = z.object({
  code: z.string().regex(inviteCodePattern, { message: 'invalid' }),
})

export function registerMemberRoutes(
  app: FastifyInstance,
  options: MemberRouteOptions,
): void {
  const { pool, config, now, limiter } = options
  const secure = config.NODE_ENV === 'production'

  app.get('/trips/:id/members', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseId(request.params, reply)
    if (!params) return
    const result = await listMembers(pool, params.id, user.id)
    if (!result.ok) return sendFailure(reply, result)
    return memberListSchema.parse({ members: result.members })
  })

  app.patch('/trips/:id/members/:userId', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idUserParams, request.params, reply, 'id')
    if (!params) return
    const input = parseBody(
      patchMemberSchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const result = await updateMemberRole(
      pool,
      user.id,
      params.id,
      params.userId,
      input.role,
    )
    if (!result.ok) return sendFailure(reply, result)
    return memberSchema.parse(result.member)
  })

  app.delete('/trips/:id/members/:userId', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idUserParams, request.params, reply, 'id')
    if (!params) return
    const result = await removeMember(pool, user.id, params.id, params.userId)
    if (!result.ok) return sendFailure(reply, result)
    return reply.code(204).send()
  })

  app.post('/trips/:id/leave', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseId(request.params, reply)
    if (!params) return
    const result = await leaveTrip(pool, user.id, params.id)
    if (!result.ok) return sendFailure(reply, result)
    return reply.code(204).send()
  })

  app.post('/trips/:id/transfer', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseId(request.params, reply)
    if (!params) return
    const input = parseBody(
      transferOwnershipSchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const result = await transferOwnership(
      pool,
      user.id,
      params.id,
      input.userId,
    )
    if (!result.ok) return sendFailure(reply, result)
    return memberListSchema.parse({ members: result.members })
  })

  app.get('/trips/:id/invites', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseId(request.params, reply)
    if (!params) return
    const result = await listInvites(pool, params.id, user.id, now())
    if (!result.ok) return sendFailure(reply, result)
    return inviteListSchema.parse({ invites: result.invites })
  })

  app.post('/trips/:id/invites', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseId(request.params, reply)
    if (!params) return
    const input = parseBody(
      createInviteSchema,
      request.body ?? {},
      reply,
      knownMessages,
    )
    if (!input) return
    const result = await createInvite(
      pool,
      user.id,
      params.id,
      input.role ?? 'visitor',
      now(),
    )
    if (!result.ok) return sendFailure(reply, result)
    return reply.code(201).send(result.invite)
  })

  app.delete('/invites/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseId(request.params, reply)
    if (!params) return
    const result = await revokeInvite(pool, user.id, params.id, now())
    if (!result.ok) return sendFailure(reply, result)
    return reply.code(204).send()
  })

  app.get('/join/:code', async (request, reply) => {
    const params = parseParams(codeParams, request.params, reply)
    if (!params) return
    if (!limiter.allow(request.ip, now())) {
      return sendError(reply, 429, 'rate_limited')
    }
    const result = await previewInvite(pool, params.code, now())
    const bot = isPreviewBot(headerValue(request.headers['user-agent']))
    if (!result.ok) {
      if (bot) return html(reply, result.status, null)
      return sendError(reply, result.status, result.reason)
    }
    if (bot) return html(reply, 200, result.preview.tripName)
    return joinPreviewSchema.parse(result.preview)
  })

  app.post('/join/:code', async (request, reply) => {
    const params = parseParams(codeParams, request.params, reply)
    if (!params) return
    if (!limiter.allow(request.ip, now())) {
      return sendError(reply, 429, 'rate_limited')
    }
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const result = await joinTrip(pool, user.id, params.code, now())
    if (!result.ok) {
      return sendError(reply, result.status, result.reason)
    }
    return joinResultSchema.parse({ tripId: result.tripId })
  })
}

function html(reply: FastifyReply, status: number, tripName: string | null) {
  return reply
    .code(status)
    .type('text/html; charset=utf-8')
    .send(joinPreviewHtml(tripName))
}

function sendFailure(reply: FastifyReply, result: MemberFailure) {
  if (result.status === 400) {
    return sendError(reply, 400, 'invalid_request', { fields: result.fields })
  }
  if (result.status === 409) {
    return sendError(reply, 409, 'conflict', {
      message: result.message ?? 'conflict',
    })
  }
  return deny(reply, result.status)
}

function parseId(params: unknown, reply: FastifyReply): { id: string } | null {
  const parsed = idSchema.safeParse(params)
  if (!parsed.success) {
    sendError(reply, 400, 'invalid_request', { fields: { id: 'invalid' } })
    return null
  }
  return parsed.data
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
