import type { FastifyReply } from 'fastify'

/** The one way to send an API error: `{ error: code, ...extra }`. */
export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  extra?: Record<string, unknown>,
): FastifyReply {
  return reply.code(status).send({ error: code, ...extra })
}
