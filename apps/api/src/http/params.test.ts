import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { idLinkParams, idParams, idUserParams, parseParams } from './params.js'

const uuid = '00000000-0000-4000-8000-000000000000'

describe('parseParams', () => {
  const app = Fastify()
  app.get('/one/:id', (request, reply) => {
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    return params
  })
  app.get('/link/:id/:linkId', (request, reply) => {
    const params = parseParams(idLinkParams, request.params, reply)
    if (!params) return
    return params
  })
  app.get('/user/:id/:userId', (request, reply) => {
    const params = parseParams(idUserParams, request.params, reply)
    if (!params) return
    return params
  })
  app.get('/code/:code', (request, reply) => {
    const params = parseParams(
      z.object({ code: z.string().regex(/^[a-z]{4}$/) }),
      request.params,
      reply,
    )
    if (!params) return
    return params
  })

  it('T-26-12 reports the overriding field key when one is given', async () => {
    const keyed = Fastify()
    keyed.get('/user/:id/:userId', (request, reply) => {
      const params = parseParams(idUserParams, request.params, reply, 'id')
      if (!params) return
      return params
    })
    const response = await keyed.inject({
      method: 'GET',
      url: `/user/${uuid}/nope`,
    })
    expect(response.json().fields).toEqual({ id: 'invalid' })
  })

  it('T-26-12 returns the parsed params for valid ids', async () => {
    const response = await app.inject({ method: 'GET', url: `/one/${uuid}` })
    expect(response.json()).toEqual({ id: uuid })
  })

  it('T-26-12 answers 400 naming the first bad param', async () => {
    const cases: Array<[string, string]> = [
      [`/one/not-a-uuid`, 'id'],
      [`/link/not-a-uuid/${uuid}`, 'id'],
      [`/link/${uuid}/nope`, 'linkId'],
      [`/user/${uuid}/nope`, 'userId'],
      [`/code/12`, 'code'],
    ]
    for (const [url, key] of cases) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode, url).toBe(400)
      expect(response.json(), url).toEqual({
        error: 'invalid_request',
        fields: { [key]: 'invalid' },
      })
    }
  })
})
