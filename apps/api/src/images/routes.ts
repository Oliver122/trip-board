import {
  imageListSchema,
  imageSchema,
  maxUploadBytes,
  quotaSchema,
} from '@tripboard/shared'
import multipart from '@fastify/multipart'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { originAllowed, requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import { deny } from '../http/validate.js'
import { UploadLimiter } from './limit.js'
import { processImage } from './process.js'
import { imageSignatureValid } from './sign.js'
import { sniffImage } from './sniff.js'
import {
  getImage,
  listImages,
  readImageBytes,
  readQuota,
  removeImage,
  storeImage,
  uploadsEnabled,
} from './store.js'
import type { ObjectStorage } from './storage.js'

export type ImageRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
  storage: ObjectStorage
  limiter: UploadLimiter
  beforeImageInsert?: () => Promise<void>
}

const idSchema = z.object({
  id: z.string().uuid({ message: 'invalid' }),
})

const fileQuerySchema = z.object({
  exp: z.coerce.number().int(),
  sig: z.string().min(1),
})

export async function registerImageRoutes(
  app: FastifyInstance,
  options: ImageRouteOptions,
): Promise<void> {
  const { pool, config, now, storage, limiter } = options
  const secure = config.NODE_ENV === 'production'

  await app.register(multipart, {
    limits: { fileSize: maxUploadBytes, files: 1 },
  })

  app.get('/me/quota', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const quota = await readQuota(pool, user.id)
    if (!quota) return deny(reply, 404)
    return quotaSchema.parse(quota)
  })

  app.get('/spots/:id/images', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(request.params, reply)
    if (!params) return
    const result = await listImages(
      pool,
      params.id,
      user.id,
      config.AUTH_SECRET,
      now(),
    )
    if (!result.ok) return deny(reply, result.status)
    return imageListSchema.parse(result)
  })

  app.get('/images/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(request.params, reply)
    if (!params) return
    const result = await getImage(
      pool,
      params.id,
      user.id,
      config.AUTH_SECRET,
      now(),
    )
    if (!result.ok) return deny(reply, result.status)
    return imageSchema.parse(result.image)
  })

  app.get('/images/:id/file', async (request, reply) => {
    const params = parseParams(request.params, reply)
    if (!params) return
    const query = fileQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        fields: { sig: 'invalid' },
      })
    }
    if (
      !imageSignatureValid(
        params.id,
        query.data.exp,
        query.data.sig,
        config.AUTH_SECRET,
        now(),
      )
    ) {
      return reply.code(403).send({ error: 'forbidden' })
    }
    const bytes = await readImageBytes(pool, storage, params.id)
    if (!bytes) return deny(reply, 404)
    return reply
      .header('cache-control', 'private, max-age=600')
      .type('image/webp')
      .send(bytes)
  })

  app.post('/spots/:id/images', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return reply.code(403).send({ error: 'forbidden_origin' })
    }
    const params = parseParams(request.params, reply)
    if (!params) return
    if (!(await uploadsEnabled(pool))) {
      return reply.code(503).send({
        error: 'uploads_paused',
        message: 'Uploads are paused',
      })
    }

    const file = await readUpload(request, reply)
    if (!file) return
    if (file.length > maxUploadBytes) {
      return reply.code(413).send({ error: 'too_large' })
    }
    if (!sniffImage(file)) {
      return reply.code(415).send({ error: 'unsupported_media' })
    }
    if (!limiter.allow(user.id, now())) {
      return reply.code(429).send({ error: 'rate_limited' })
    }

    let processed
    try {
      processed = await processImage(file)
    } catch {
      return reply.code(415).send({ error: 'unsupported_media' })
    }

    const result = await storeImage(pool, storage, {
      userId: user.id,
      spotId: params.id,
      image: processed,
      secret: config.AUTH_SECRET,
      now: now(),
      beforeInsert: options.beforeImageInsert,
    })
    if (!result.ok) {
      if (result.status === 413 && result.quota) {
        return reply.code(413).send({
          error: 'quota_exceeded',
          ...result.quota,
        })
      }
      return deny(reply, result.status === 413 ? 404 : result.status)
    }
    return reply.code(201).send(imageSchema.parse(result.image))
  })

  app.delete('/images/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return reply.code(403).send({ error: 'forbidden_origin' })
    }
    const params = parseParams(request.params, reply)
    if (!params) return
    const result = await removeImage(pool, params.id, user.id)
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

async function readUpload(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<Buffer | null> {
  let file
  try {
    file = await request.file()
  } catch {
    reply.code(400).send({
      error: 'invalid_request',
      fields: { file: 'invalid' },
    })
    return null
  }
  if (!file) {
    reply.code(400).send({
      error: 'invalid_request',
      fields: { file: 'empty' },
    })
    return null
  }
  const chunks: Buffer[] = []
  for await (const chunk of file.file) chunks.push(Buffer.from(chunk))
  if (file.file.truncated) {
    reply.code(413).send({ error: 'too_large' })
    return null
  }
  return Buffer.concat(chunks)
}
