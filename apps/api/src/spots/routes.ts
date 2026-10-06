import {
  createSpotSchema,
  patchSpotSchema,
  spotDetailSchema,
  spotListSchema,
  strictSpotListQuery,
} from '@tripboard/shared'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { originAllowed, requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import { deny, parseBody } from '../http/validate.js'
import { listSpotPlans } from '../plan/store.js'
import {
  createSpot,
  deleteSpot,
  getSpot,
  listSpots,
  updateSpot,
} from './store.js'

export type SpotRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
}

const knownMessages = new Set([
  'empty',
  'too_long',
  'invalid',
  'planned_automatic',
])

const idSchema = z.object({
  id: z.string().uuid({ message: 'invalid' }),
})

export function registerSpotRoutes(
  app: FastifyInstance,
  options: SpotRouteOptions,
): void {
  const { pool, config, now } = options
  const secure = config.NODE_ENV === 'production'

  app.get('/trips/:id/spots', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(request.params, reply)
    if (!params) return
    const filters = strictSpotListQuery(request.query)
    if (!filters.ok) {
      return reply.code(400).send({
        error: 'invalid_request',
        fields: filters.fields,
      })
    }
    const result = await listSpots(pool, params.id, user.id, filters.filters)
    if (!result.ok) return deny(reply, result.status)
    return spotListSchema.parse({ spots: result.spots, total: result.total })
  })

  app.post('/trips/:id/spots', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return reply.code(403).send({ error: 'forbidden_origin' })
    }
    const params = parseParams(request.params, reply)
    if (!params) return
    const input = parseBody(
      createSpotSchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const result = await createSpot(pool, user.id, params.id, input)
    if (!result.ok) {
      if (result.status === 400) {
        return reply.code(400).send({
          error: 'invalid_request',
          fields: result.fields,
        })
      }
      return deny(reply, result.status)
    }
    return reply.code(201).send(result.spot)
  })

  app.get('/spots/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(request.params, reply)
    if (!params) return
    const spot = await getSpot(pool, params.id, user.id)
    if (!spot) return deny(reply, 404)
    const plans = await listSpotPlans(pool, spot.id)
    return spotDetailSchema.parse({ ...spot, plans })
  })

  app.patch('/spots/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return reply.code(403).send({ error: 'forbidden_origin' })
    }
    const params = parseParams(request.params, reply)
    if (!params) return
    const input = parseBody(patchSpotSchema, request.body, reply, knownMessages)
    if (!input) return
    const result = await updateSpot(pool, user.id, params.id, input)
    if (!result.ok) {
      if (result.status === 400) {
        return reply.code(400).send({
          error: 'invalid_request',
          fields: result.fields,
        })
      }
      return deny(reply, result.status)
    }
    return result.spot
  })

  app.delete('/spots/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return reply.code(403).send({ error: 'forbidden_origin' })
    }
    const params = parseParams(request.params, reply)
    if (!params) return
    const result = await deleteSpot(pool, user.id, params.id)
    if (!result.ok) return deny(reply, result.status)
    return reply.code(204).send()
  })
}

function parseParams(
  params: unknown,
  reply: FastifyReply,
): { id: string } | null {
  const parsed = idSchema.safeParse(params)
  if (!parsed.success) {
    reply.code(400).send({
      error: 'invalid_request',
      fields: { id: 'invalid' },
    })
    return null
  }
  return parsed.data
}
