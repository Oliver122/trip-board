import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import { sendError } from './errors.js'

const uuid = z.string().uuid({ message: 'invalid' })

export const idParams = z.object({ id: uuid })
export const idLinkParams = z.object({ id: uuid, linkId: uuid })
export const idUserParams = z.object({ id: uuid, userId: uuid })

export function parseParams<S extends z.ZodTypeAny>(
  schema: S,
  params: unknown,
  reply: FastifyReply,
  fieldKey?: string,
): z.infer<S> | null {
  const parsed = schema.safeParse(params)
  if (parsed.success) return parsed.data as z.infer<S>
  const key = fieldKey ?? String(parsed.error.issues[0]?.path[0] ?? 'id')
  sendError(reply, 400, 'invalid_request', { fields: { [key]: 'invalid' } })
  return null
}
