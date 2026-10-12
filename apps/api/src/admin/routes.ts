import {
  activityListSchema,
  activityQuerySchema,
  adminMetricsSchema,
  adminStatsSchema,
  adminStorageSchema,
  adminTripDetailSchema,
  adminKindLimitRequestListSchema,
  adminKindLimitSchema,
  adminTripListSchema,
  adminUserDetailSchema,
  adminUserListSchema,
  appSettingsSchema,
  auditListSchema,
  auditQuerySchema,
  kindLimitApproveSchema,
  kindLimitPatchSchema,
  kindLimitRejectSchema,
  quotaApproveSchema,
  quotaPatchSchema,
  quotaRejectSchema,
  quotaRequestCreateSchema,
  quotaRequestListSchema,
  requestListQuerySchema,
  rolePatchSchema,
  metricsQuerySchema,
  settingsPatchSchema,
  statsQuerySchema,
  suspendSchema,
  tripListQuerySchema,
  userListQuerySchema,
} from '@tripboard/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { originAllowed, requireUser } from '../auth/require-user.js'
import { requireAppRole } from '../auth/require-role.js'
import type { AppConfig } from '../config.js'
import { activityCsv, listActivity } from './activity.js'
import { metricsRangeError, readMetrics } from './metrics.js'
import { readStats } from './stats.js'
import { readStorage } from './storage.js'
import { notifyQuotaRequest, reportCapacityWarnings } from './webhook.js'
import { listAudit } from './log.js'
import type { AdminHooks } from './hooks.js'
import {
  approveKindLimitRequest,
  listKindLimitRequests,
  rejectKindLimitRequest,
  setKindLimitOverride,
} from './kind-limits.js'
import { decodeCursor, isInvalidCursor } from './page.js'
import {
  approveQuotaRequest,
  createQuotaRequest,
  listQuotaRequests,
  listRequestsForUser,
  rejectQuotaRequest,
} from './requests.js'
import { readSettings, updateSettings } from './settings.js'
import { getAdminTrip, listTrips } from './trips.js'
import {
  getAdminUser,
  listUsers,
  logoutUser,
  setUserRole,
  suspendUser,
  unsuspendUser,
  updateQuota,
} from './users.js'
import { sendError } from '../http/errors.js'
import { idParams, parseParams } from '../http/params.js'

export type AdminRoute = {
  method: string
  url: string
}

const indexed = new WeakMap<FastifyInstance, AdminRoute[]>()

export function listAdminRoutes(app: FastifyInstance): AdminRoute[] {
  return indexed.get(app) ?? []
}

export type AdminRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
  hooks?: AdminHooks
  webhookFetch?: typeof fetch
}

export function registerAdminRoutes(
  app: FastifyInstance,
  options: AdminRouteOptions,
): void {
  const { pool, config, now } = options
  const webhookUrl = config.ADMIN_DISCORD_WEBHOOK_URL
  const hooks = options.hooks ?? {}
  const secure = config.NODE_ENV === 'production'
  const routes: AdminRoute[] = []
  indexed.set(app, routes)
  app.addHook('onRoute', (route) => {
    if (!route.url.startsWith('/admin')) return
    const methods = Array.isArray(route.method) ? route.method : [route.method]
    for (const method of methods) {
      routes.push({ method, url: route.url })
    }
  })

  const admin = async (request: FastifyRequest, reply: FastifyReply) =>
    requireAppRole(request, reply, pool, now(), secure, 'admin')

  app.get('/admin/streams', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    return { openStreams: app.tripHub.openCount() }
  })

  app.get('/admin/stats', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    const query = statsQuerySchema.safeParse(request.query)
    if (!query.success) return sendError(reply, 400, 'invalid_request')
    const stats = await readStats(pool, query.data.range, now())
    await reportCapacityWarnings(pool, {
      url: webhookUrl,
      now: now(),
      fetchImpl: options.webhookFetch,
    }).catch(() => undefined)
    return adminStatsSchema.parse(stats)
  })

  app.get('/admin/metrics', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    const query = metricsQuerySchema.safeParse(request.query)
    if (!query.success) return sendError(reply, 400, 'invalid_request')
    if (metricsRangeError(query.data.from, query.data.to)) {
      return sendError(reply, 400, 'invalid_request')
    }
    return adminMetricsSchema.parse(
      await readMetrics(pool, query.data.from, query.data.to),
    )
  })

  app.get('/admin/activity', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    const query = activityQuerySchema.safeParse(request.query)
    if (!query.success) return sendError(reply, 400, 'invalid_request')
    if (query.data.from && query.data.to && query.data.from > query.data.to) {
      return sendError(reply, 400, 'invalid_request')
    }
    try {
      const result = await listActivity(pool, query.data)
      if ('error' in result) return sendError(reply, 400, 'invalid_request')
      return activityListSchema.parse(result)
    } catch (error) {
      if (isInvalidCursor(error))
        return sendError(reply, 400, 'invalid_request')
      throw error
    }
  })

  app.get('/admin/activity/export', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    const query = activityQuerySchema.safeParse(request.query)
    if (!query.success) return sendError(reply, 400, 'invalid_request')
    if (query.data.from && query.data.to && query.data.from > query.data.to) {
      return sendError(reply, 400, 'invalid_request')
    }
    if (query.data.cursor && decodeCursor(query.data.cursor) === 'invalid') {
      return sendError(reply, 400, 'invalid_request')
    }
    return reply
      .header('content-disposition', 'attachment; filename="activity.csv"')
      .type('text/csv; charset=utf-8')
      .send(activityCsv(pool, query.data))
  })

  app.get('/admin/storage', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    return adminStorageSchema.parse(await readStorage(pool))
  })

  app.get('/admin/users', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    const query = userListQuerySchema.safeParse(request.query)
    if (!query.success) return sendError(reply, 400, 'invalid_request')
    try {
      const result = await listUsers(pool, query.data)
      if ('error' in result) return sendError(reply, 400, 'invalid_request')
      return adminUserListSchema.parse(result)
    } catch (error) {
      if (isInvalidCursor(error))
        return sendError(reply, 400, 'invalid_request')
      throw error
    }
  })

  app.get('/admin/users/:id', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const detail = await getAdminUser(pool, params.id)
    if (!detail) return sendError(reply, 404, 'not_found')
    return adminUserDetailSchema.parse(detail)
  })

  app.patch('/admin/users/:id/quota', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const body = quotaPatchSchema.safeParse(request.body)
    if (!body.success) return sendError(reply, 400, 'invalid_request')
    const result = await updateQuota(pool, user.id, params.id, body.data, hooks)
    if (!result.ok) return sendError(reply, result.status, 'not_found')
    return result.user
  })

  app.post('/admin/users/:id/suspend', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const body = suspendSchema.safeParse(request.body)
    if (!body.success) return sendError(reply, 400, 'invalid_request')
    const result = await suspendUser(
      pool,
      user.id,
      params.id,
      body.data.reason,
      now(),
      hooks,
    )
    if (!result.ok) {
      return sendError(reply, result.status, result.error)
    }
    return reply.code(204).send()
  })

  app.post('/admin/users/:id/unsuspend', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const result = await unsuspendUser(pool, user.id, params.id, hooks)
    if (!result.ok) return sendError(reply, result.status, 'not_found')
    return reply.code(204).send()
  })

  app.patch('/admin/users/:id/role', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const body = rolePatchSchema.safeParse(request.body)
    if (!body.success) return sendError(reply, 400, 'invalid_request')
    const result = await setUserRole(
      pool,
      user.id,
      params.id,
      body.data.appRole,
      hooks,
    )
    if (!result.ok) return sendError(reply, result.status, result.error)
    return reply.code(204).send()
  })

  app.post('/admin/users/:id/logout-all', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const result = await logoutUser(pool, user.id, params.id, hooks)
    if (!result.ok) return sendError(reply, result.status, 'not_found')
    return reply.code(204).send()
  })

  app.get('/admin/trips', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    const query = tripListQuerySchema.safeParse(request.query)
    if (!query.success) return sendError(reply, 400, 'invalid_request')
    try {
      const result = await listTrips(pool, query.data)
      if ('error' in result) return sendError(reply, 400, 'invalid_request')
      return adminTripListSchema.parse(result)
    } catch (error) {
      if (isInvalidCursor(error))
        return sendError(reply, 400, 'invalid_request')
      throw error
    }
  })

  app.get('/admin/trips/:id', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const detail = await getAdminTrip(pool, params.id)
    if (!detail) return sendError(reply, 404, 'not_found')
    return adminTripDetailSchema.parse(detail)
  })

  app.get('/admin/quota-requests', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    const query = requestListQuerySchema.safeParse(request.query)
    if (!query.success) return sendError(reply, 400, 'invalid_request')
    try {
      const result = await listQuotaRequests(pool, query.data)
      if ('error' in result) return sendError(reply, 400, 'invalid_request')
      return quotaRequestListSchema.parse(result)
    } catch (error) {
      if (isInvalidCursor(error))
        return sendError(reply, 400, 'invalid_request')
      throw error
    }
  })

  app.post('/admin/quota-requests/:id/approve', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const body = quotaApproveSchema.safeParse(request.body ?? {})
    if (!body.success) return sendError(reply, 400, 'invalid_request')
    const result = await approveQuotaRequest(
      pool,
      user.id,
      params.id,
      body.data,
      now(),
      hooks,
    )
    if (!result.ok) return sendError(reply, result.status, result.error)
    return reply.code(204).send()
  })

  app.post('/admin/quota-requests/:id/reject', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const body = quotaRejectSchema.safeParse(request.body ?? {})
    if (!body.success) return sendError(reply, 400, 'invalid_request')
    const result = await rejectQuotaRequest(
      pool,
      user.id,
      params.id,
      body.data.note,
      now(),
      hooks,
    )
    if (!result.ok) return sendError(reply, result.status, result.error)
    return reply.code(204).send()
  })

  app.patch('/admin/trips/:id/kind-limit', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const body = kindLimitPatchSchema.safeParse(request.body)
    if (!body.success) return sendError(reply, 400, 'invalid_request')
    const result = await setKindLimitOverride(
      pool,
      user.id,
      params.id,
      body.data,
      hooks,
    )
    if (!result.ok) return sendError(reply, result.status, result.error)
    return adminKindLimitSchema.parse(result.kindLimit)
  })

  app.get('/admin/kind-limit-requests', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    const query = requestListQuerySchema.safeParse(request.query)
    if (!query.success) return sendError(reply, 400, 'invalid_request')
    try {
      const result = await listKindLimitRequests(pool, query.data)
      if ('error' in result) return sendError(reply, 400, 'invalid_request')
      return adminKindLimitRequestListSchema.parse(result)
    } catch (error) {
      if (isInvalidCursor(error))
        return sendError(reply, 400, 'invalid_request')
      throw error
    }
  })

  app.post('/admin/kind-limit-requests/:id/approve', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const body = kindLimitApproveSchema.safeParse(request.body ?? {})
    if (!body.success) return sendError(reply, 400, 'invalid_request')
    const result = await approveKindLimitRequest(
      pool,
      user.id,
      params.id,
      body.data,
      now(),
      hooks,
    )
    if (!result.ok) return sendError(reply, result.status, result.error)
    return { ok: true }
  })

  app.post('/admin/kind-limit-requests/:id/reject', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const body = kindLimitRejectSchema.safeParse(request.body ?? {})
    if (!body.success) return sendError(reply, 400, 'invalid_request')
    const result = await rejectKindLimitRequest(
      pool,
      user.id,
      params.id,
      body.data.note,
      now(),
      hooks,
    )
    if (!result.ok) return sendError(reply, result.status, result.error)
    return { ok: true }
  })

  app.get('/admin/settings', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    const settings = await readSettings(pool)
    if (!settings) return sendError(reply, 404, 'not_found')
    return appSettingsSchema.parse(settings)
  })

  app.patch('/admin/settings', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const body = settingsPatchSchema.safeParse(request.body)
    if (!body.success) return sendError(reply, 400, 'invalid_request')
    const result = await updateSettings(pool, user.id, body.data, hooks)
    if (!result.ok) return sendError(reply, result.status, 'not_found')
    return appSettingsSchema.parse(result.settings)
  })

  app.get('/admin/audit', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user) return
    const query = auditQuerySchema.safeParse(request.query)
    if (!query.success) return sendError(reply, 400, 'invalid_request')
    try {
      const result = await listAudit(pool, query.data)
      if ('error' in result) return sendError(reply, 400, 'invalid_request')
      return auditListSchema.parse(result)
    } catch (error) {
      if (isInvalidCursor(error))
        return sendError(reply, 400, 'invalid_request')
      throw error
    }
  })

  app.get('/me/quota-requests', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const requests = await listRequestsForUser(pool, user.id)
    const pendingCount = requests.filter(
      (item) => item.status === 'pending',
    ).length
    return quotaRequestListSchema.parse({
      requests,
      pendingCount,
      nextCursor: null,
    })
  })

  app.post('/me/quota-requests', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const body = quotaRequestCreateSchema.safeParse(request.body)
    if (!body.success) return sendError(reply, 400, 'invalid_request')
    const result = await createQuotaRequest(pool, user.id, body.data)
    if (!result.ok) return sendError(reply, result.status, result.error)
    await notifyQuotaRequest({
      url: webhookUrl,
      username: result.request.displayName ?? result.request.username,
      fetchImpl: options.webhookFetch,
    }).catch(() => undefined)
    return reply.code(201).send(result.request)
  })
}
