import type { FastifyReply } from 'fastify'
import { z } from 'zod'

export function parseBody<Output, Input = unknown>(
  schema: z.ZodType<Output, z.ZodTypeDef, Input>,
  body: unknown,
  reply: FastifyReply,
  knownMessages: ReadonlySet<string>,
): Output | null {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    reply.code(400).send({
      error: 'invalid_request',
      fields: fieldErrors(parsed.error, knownMessages),
    })
    return null
  }
  return parsed.data
}

export function fieldErrors(
  error: z.ZodError,
  knownMessages: ReadonlySet<string>,
): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || 'body'
    if (key in fields) continue
    fields[key] = knownMessages.has(issue.message) ? issue.message : 'invalid'
  }
  return fields
}

export function deny(reply: FastifyReply, status: 403 | 404) {
  const error = status === 403 ? 'forbidden' : 'not_found'
  return reply.code(status).send({ error })
}

export function isCheckViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23514'
  )
}
