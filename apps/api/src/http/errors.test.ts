import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { sendError } from './errors.js'

describe('sendError', () => {
  it('T-26-13 sends { error } with the status and merges extras', async () => {
    const app = Fastify()
    app.get('/plain', (_request, reply) => sendError(reply, 404, 'not_found'))
    app.get('/extra', (_request, reply) =>
      sendError(reply, 409, 'conflict', {
        current: { name: 'a' },
        updatedBy: null,
      }),
    )
    const plain = await app.inject({ method: 'GET', url: '/plain' })
    expect(plain.statusCode).toBe(404)
    expect(plain.json()).toEqual({ error: 'not_found' })
    const extra = await app.inject({ method: 'GET', url: '/extra' })
    expect(extra.statusCode).toBe(409)
    expect(extra.json()).toEqual({
      error: 'conflict',
      current: { name: 'a' },
      updatedBy: null,
    })
    await app.close()
  })
})
