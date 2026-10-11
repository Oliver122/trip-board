import {
  createKindSchema,
  kindListSchema,
  patchKindSchema,
  reorderKindsSchema,
} from '@tripboard/shared'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { originAllowed, requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import { sendError } from '../http/errors.js'
import { idParams, parseParams } from '../http/params.js'
import { deny, fieldErrors, parseBody } from '../http/validate.js'
import {
  createKind,
  deleteKind,
  listKinds,
  reorderKinds,
  updateKind,
  type KindFailure,
} from './store.js'

export type KindRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
}

const uuid = z.string().uuid({ message: 'invalid' })
const kindParams = z.object({ id: uuid, kindId: uuid })
const deleteQuery = z.object({ moveTo: uuid.optional() })

const knownMessages = new Set(['empty', 'too_long', 'invalid'])
const colorCodes = new Set(['kind_color_contrast', 'kind_color_reserved'])

/** Parses a kind body; a bad color answers with its own error code. */
function parseKindBody<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  body: unknown,
  reply: FastifyReply,
): T | null {
  const parsed = schema.safeParse(body)
  if (parsed.success) return parsed.data
  const colorIssue = parsed.error.issues.find(
    (issue) => issue.path[0] === 'color' && colorCodes.has(issue.message),
  )
  if (colorIssue) {
    sendError(reply, 400, colorIssue.message, { fields: { color: 'invalid' } })
    return null
  }
  return parseBody(schema, body, reply, knownMessages)
}

function kindFailure(reply: FastifyReply, result: KindFailure) {
  if ('error' in result) {
    return sendError(reply, result.status, result.error, {
      ...(result.fields ? { fields: result.fields } : {}),
    })
  }
  return deny(reply, result.status)
}

export function registerKindRoutes(
  app: FastifyInstance,
  options: KindRouteOptions,
): void {
  const { pool, config, now } = options
  const secure = config.NODE_ENV === 'production'

  app.get('/trips/:id/kinds', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const result = await listKinds(pool, params.id, user.id)
    if (!result.ok) return deny(reply, result.status)
    return kindListSchema.parse({ kinds: result.kinds })
  })

  app.post('/trips/:id/kinds', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const input = parseKindBody(createKindSchema, request.body, reply)
    if (!input) return
    const result = await createKind(pool, user.id, params.id, input)
    if (!result.ok) return kindFailure(reply, result)
    return reply.code(201).send(result.kind)
  })

  app.put('/trips/:id/kinds/order', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const input = parseBody(
      reorderKindsSchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const result = await reorderKinds(pool, user.id, params.id, input.ids)
    if (!result.ok) return kindFailure(reply, result)
    return kindListSchema.parse({ kinds: result.kinds })
  })

  app.patch('/trips/:id/kinds/:kindId', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(kindParams, request.params, reply)
    if (!params) return
    const input = parseKindBody(patchKindSchema, request.body, reply)
    if (!input) return
    const result = await updateKind(
      pool,
      user.id,
      params.id,
      params.kindId,
      input,
    )
    if (!result.ok) return kindFailure(reply, result)
    return result.kind
  })

  app.delete('/trips/:id/kinds/:kindId', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(kindParams, request.params, reply)
    if (!params) return
    const query = deleteQuery.safeParse(request.query)
    if (!query.success) {
      return sendError(reply, 400, 'invalid_request', {
        fields: fieldErrors(query.error, knownMessages),
      })
    }
    const result = await deleteKind(
      pool,
      user.id,
      params.id,
      params.kindId,
      query.data.moveTo ?? null,
    )
    if (!result.ok) return kindFailure(reply, result)
    return reply.code(204).send()
  })
}
