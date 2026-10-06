import { strictSpotListQuery } from '@tripboard/shared'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import { deny } from '../http/validate.js'
import { buildExport, type ExportFormat } from './store.js'

export type ExportRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
}

const idSchema = z.object({
  id: z.string().uuid({ message: 'invalid' }),
})

export function registerExportRoutes(
  app: FastifyInstance,
  options: ExportRouteOptions,
): void {
  const { pool, config, now } = options
  const secure = config.NODE_ENV === 'production'

  app.get('/trips/:id/export', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(request.params, reply)
    if (!params) return
    const format = readFormat(request.query)
    if (!format) {
      return reply.code(400).send({
        error: 'invalid_request',
        fields: { format: 'invalid' },
      })
    }
    const filters = strictSpotListQuery(request.query)
    if (!filters.ok) {
      return reply.code(400).send({
        error: 'invalid_request',
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
