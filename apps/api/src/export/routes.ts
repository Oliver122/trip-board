import { strictSpotListQuery } from '@tripboard/shared'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import { deny } from '../http/validate.js'
import { buildExport, type ExportFormat } from './store.js'
import { sendError } from '../http/errors.js'
import { idParams, parseParams } from '../http/params.js'

export type ExportRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
}

export function registerExportRoutes(
  app: FastifyInstance,
  options: ExportRouteOptions,
): void {
  const { pool, config, now } = options
  const secure = config.NODE_ENV === 'production'

  app.get('/trips/:id/export', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const format = readFormat(request.query)
    if (!format) {
      return sendError(reply, 400, 'invalid_request', {
        fields: { format: 'invalid' },
      })
    }
    const filters = strictSpotListQuery(request.query)
    if (!filters.ok) {
      return sendError(reply, 400, 'invalid_request', {
        fields: filters.fields,
      })
    }
    const result = await buildExport(
      pool,
      user.id,
      params.id,
      user.locale,
      filters.filters,
      format,
      now(),
    )
    if (!result.ok) return deny(reply, result.status)
    return reply
      .header('content-type', result.contentType)
      .header(
        'content-disposition',
        `attachment; filename="${result.filename}"`,
      )
      .header('cache-control', 'no-store')
      .send(result.body)
  })
}

function readFormat(query: unknown): ExportFormat | null {
  if (query === null || typeof query !== 'object') return null
  const format = (query as { format?: unknown }).format
  if (format === 'csv' || format === 'pdf' || format === 'ics') return format
  return null
}
