import {
  createTripSchema,
  patchTripSchema,
  tripListSchema,
} from '@tripboard/shared'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Pool } from 'pg'
import { originAllowed, requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import { readExpected } from '../live/conflict.js'
import { invalidExpected } from '../live/routes.js'
import { requireTripRole } from './roles.js'
import {
  createTrip,
  deleteTrip,
  getTrip,
  listTrips,
  updateTrip,
} from './store.js'
import { sendError } from '../http/errors.js'
import { idParams, parseParams } from '../http/params.js'
import { deny, parseBody } from '../http/validate.js'

export type TripRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
}

const knownMessages = new Set([
  'empty',
  'too_long',
  'invalid',
  'invalid_date',
  'before_start',
  'min_greater_than_max',
])

export function registerTripRoutes(
  app: FastifyInstance,
  options: TripRouteOptions,
): void {
  const { pool, config, now } = options
  const secure = config.NODE_ENV === 'production'

  app.get('/trips', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const trips = await listTrips(pool, user.id)
    return tripListSchema.parse({ trips })
  })

  app.post('/trips', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const input = parseBody(
      createTripSchema,
      request.body,
      reply,
      knownMessages,
    )
    if (!input) return
    const trip = await createTrip(pool, user.id, {
      name: input.name,
      timezone: input.timezone,
      startDate: input.startDate,
      endDate: input.endDate,
      bbox: input.region.bbox,
    })
    return reply.code(201).send(trip)
  })

  app.get('/trips/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const access = await requireTripRole(pool, params.id, user.id, 'visitor')
    if (!access.ok) return deny(reply, access.status)
    const trip = await getTrip(pool, params.id, user.id)
    if (!trip) return deny(reply, 404)
    return trip
  })

  app.patch('/trips/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const input = parseBody(patchTripSchema, request.body, reply, knownMessages)
    if (!input) return
    const expected = readExpected(request)
    if (!expected.ok) return invalidExpected(reply)
    const result = await updateTrip(
      pool,
      user.id,
      params.id,
      input,
      expected.at,
    )
    if (!result.ok) return tripFailure(reply, result)
    return result.trip
  })

  app.delete('/trips/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const expected = readExpected(request)
    if (!expected.ok) return invalidExpected(reply)
    const result = await deleteTrip(pool, user.id, params.id, expected.at)
    if (!result.ok) return tripFailure(reply, result)
    return reply.code(204).send()
  })
}

function tripFailure(
  reply: FastifyReply,
  result: {
    status: 400 | 403 | 404 | 409
    fields?: Record<string, string>
    current?: unknown
    updatedBy?: unknown
  },
) {
  if (result.status === 400) {
    return sendError(reply, 400, 'invalid_request', { fields: result.fields })
  }
  if (result.status === 409) {
    return sendError(reply, 409, 'conflict', {
      updatedBy: result.updatedBy ?? null,
      current: result.current,
    })
  }
  return deny(reply, result.status)
}
