import {
  addPlanSpotSchema,
  createPlanEntrySchema,
  patchPlanEntrySchema,
  patchPlanSpotSchema,
  planEntrySchema,
  planEntryUpdateSchema,
  planLinkSchema,
  planListSchema,
  reorderPlanSpotsSchema,
} from '@tripboard/shared'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Pool } from 'pg'
import { originAllowed, requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import { deny, parseBody } from '../http/validate.js'
import { readExpected } from '../live/conflict.js'
import { invalidExpected } from '../live/routes.js'
import {
  addPlanSpot,
  createPlanEntry,
  deletePlanEntry,
  listPlan,
  removePlanSpot,
  reorderPlanSpots,
  updatePlanEntry,
  updatePlanSpot,
  type PlanFailure,
} from './store.js'
import { sendError } from '../http/errors.js'
import { idParams, idLinkParams, parseParams } from '../http/params.js'

export type PlanRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
}

const knownMessages = new Set([
  'empty',
  'too_long',
  'invalid',
  'invalid_date',
  'invalid_time',
  'before_start',
  'end_date_required',
  'spans_days',
  'end_time_needs_start',
  'end_before_start',
  'outside_range',
  'visit_time_needs_date',
  'other_entry',
  'incomplete',
])

export function registerPlanRoutes(
  app: FastifyInstance,
  options: PlanRouteOptions,
): void {
  const { pool, config, now } = options
  const secure = config.NODE_ENV === 'production'

  app.get('/trips/:id/plan', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const result = await listPlan(pool, params.id, user.id)
    if (!result.ok) return deny(reply, result.status)
    return planListSchema.parse({ entries: result.entries })
  })

  app.post('/trips/:id/plan', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const input = parseBody(
      createPlanEntrySchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const result = await createPlanEntry(pool, user.id, params.id, input)
    if (!result.ok) return sendFailure(reply, result)
    return reply.code(201).send(planEntrySchema.parse(result.entry))
  })

  app.patch('/plan/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const input = parseBody(
      patchPlanEntrySchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const expected = readExpected(request)
    if (!expected.ok) return invalidExpected(reply)
    const result = await updatePlanEntry(
      pool,
      user.id,
      params.id,
      input,
      expected.at,
    )
    if (!result.ok) return sendFailure(reply, result)
    return planEntryUpdateSchema.parse(result.entry)
  })

  app.delete('/plan/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const expected = readExpected(request)
    if (!expected.ok) return invalidExpected(reply)
    const result = await deletePlanEntry(pool, user.id, params.id, expected.at)
    if (!result.ok) return sendFailure(reply, result)
    return reply.code(204).send()
  })

  app.post('/plan/:id/spots', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const input = parseBody(
      addPlanSpotSchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const result = await addPlanSpot(pool, user.id, params.id, input)
    if (!result.ok) return sendFailure(reply, result)
    return reply.code(201).send(planLinkSchema.parse(result.link))
  })

  app.patch('/plan/:id/spots/:linkId', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idLinkParams, request.params, reply)
    if (!params) return
    const input = parseBody(
      patchPlanSpotSchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const result = await updatePlanSpot(
      pool,
      user.id,
      params.id,
      params.linkId,
      input,
    )
    if (!result.ok) return sendFailure(reply, result)
    return planLinkSchema.parse(result.link)
  })

  app.delete('/plan/:id/spots/:linkId', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idLinkParams, request.params, reply)
    if (!params) return
    const result = await removePlanSpot(pool, user.id, params.id, params.linkId)
    if (!result.ok) return deny(reply, result.status)
    return reply.code(204).send()
  })

  app.put('/plan/:id/spots/order', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const input = parseBody(
      reorderPlanSpotsSchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const result = await reorderPlanSpots(
      pool,
      user.id,
      params.id,
      input.linkIds,
    )
    if (!result.ok) return sendFailure(reply, result)
    return planEntrySchema.parse(result.entry)
  })
}

function sendFailure(reply: FastifyReply, result: PlanFailure) {
  if (result.status === 400) {
    return sendError(reply, 400, 'invalid_request', {
      ...(result.message ? { message: result.message } : {}),
      fields: result.fields,
    })
  }
  if (result.status === 409) {
    return sendError(reply, 409, 'conflict', {
      updatedBy: result.updatedBy,
      current: result.current,
    })
  }
  return deny(reply, result.status)
}
