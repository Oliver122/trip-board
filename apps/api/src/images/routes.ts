import {
  imageFromCommonsSchema,
  imageFromUrlSchema,
  imageListSchema,
  imageSchema,
  fileSizeLimits,
  photoSuggestionListSchema,
  quotaSchema,
  webImageLimits,
} from '@tripboard/shared'
import multipart from '@fastify/multipart'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { originAllowed, requireUser } from '../auth/require-user.js'
import type { AppConfig } from '../config.js'
import { deny } from '../http/validate.js'
import { requireTripRole } from '../trips/roles.js'
import {
  CommonsError,
  commonsRenditionHost,
  lookupCommonsFile,
  pointKey,
  searchCommons,
  type CommonsClient,
} from './commons.js'
import { UploadLimiter } from './limit.js'
import { processImage } from './process.js'
import { imageSignatureValid } from './sign.js'
import { sniffImage } from './sniff.js'
import {
  fixtureCommonsFetch,
  fixtureFile,
  fixtureIntercept,
} from './test-fixtures.js'
import {
  getImage,
  hasSourceImage,
  listImages,
  planSpotAccess,
  readImageBytes,
  readQuota,
  removeImage,
  storeImage,
  uploadsEnabled,
  type ImageSource,
} from './store.js'
import type { ObjectStorage } from './storage.js'
import {
  fetchWebImage,
  parseWebUrl,
  type WebFetchOptions,
} from './web-fetch.js'
import { wikimediaFileTitle, wikimediaRendition } from './wikimedia.js'
import { sendError } from '../http/errors.js'
import { idParams, parseParams } from '../http/params.js'

export type ImageRouteOptions = {
  pool: Pool
  config: AppConfig
  now: () => Date
  storage: ObjectStorage
  limiter: UploadLimiter
  beforeImageInsert?: () => Promise<void>
  /** Step 34: downloads from the web; tests inject a resolver. */
  webFetch?: WebFetchOptions
  /** Step 34: Wikimedia Commons API fetcher; tests inject a fake. */
  commonsFetch?: typeof fetch
}

const suggestionQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
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
    limits: { fileSize: fileSizeLimits.max, files: 1 },
  })

  const inTest = config.NODE_ENV === 'test'
  // Read per request, so tests may adjust the injected options between calls.
  const webOptions = (): WebFetchOptions => ({
    userAgent: `TripBoard/0.1 (+${config.WEB_ORIGIN})`,
    ...(options.webFetch ?? (inTest ? { intercept: fixtureIntercept } : {})),
  })
  const commonsClient = (): CommonsClient => ({
    fetch:
      options.commonsFetch ??
      (inTest ? fixtureCommonsFetch(config) : globalThis.fetch),
    baseUrl: config.COMMONS_BASE_URL,
    userAgent: `TripBoard/0.1 (+${config.WEB_ORIGIN})`,
  })

  if (inTest) {
    app.get('/test/fixtures/:name', async (request, reply) => {
      const { name } = request.params as { name: string }
      const file = await fixtureFile(name)
      if (!file) return deny(reply, 404)
      for (const [header, value] of Object.entries(file.headers ?? {})) {
        reply.header(header, value)
      }
      return reply.code(file.status).send(file.body)
    })
  }

  // The caller's effective per-file limit (R-43-02, R-43-03).
  const maxFileBytesFor = async (userId: string) =>
    (await readQuota(pool, userId))?.maxFileBytes ?? fileSizeLimits.default

  // The shared tail of every upload path: type, size, rate, resize, quota.
  const ingest = async (
    reply: FastifyReply,
    userId: string,
    spotId: string,
    file: Buffer,
    maxFileBytes: number,
    source?: ImageSource,
  ) => {
    if (file.length > maxFileBytes) {
      return sendError(reply, 413, 'too_large', { maxFileBytes })
    }
    if (!sniffImage(file)) {
      return sendError(reply, 415, 'unsupported_media')
    }

    let processed
    try {
      processed = await processImage(file)
    } catch {
      return sendError(reply, 415, 'unsupported_media')
    }

    const result = await storeImage(pool, storage, {
      userId,
      spotId,
      image: processed,
      secret: config.AUTH_SECRET,
      now: now(),
      beforeInsert: options.beforeImageInsert,
      source,
    })
    if (!result.ok) {
      if (result.status === 409) return sendError(reply, 409, 'already_added')
      if (result.status === 413 && result.quota) {
        return sendError(reply, 413, 'quota_exceeded', { ...result.quota })
      }
      return deny(reply, result.status === 413 ? 404 : result.status)
    }
    return reply.code(201).send(imageSchema.parse(result.image))
  }

  // A Commons file by title: license check, duplicate check, the rendition
  // download and the credit (R-34-09); shared by from-commons and the File:
  // page links of from-url (R-43-11).
  const addCommonsFile = async (
    reply: FastifyReply,
    userId: string,
    spotId: string,
    fileTitle: string,
    call: { maxFileBytes: number; missing: () => FastifyReply },
  ) => {
    let looked
    try {
      looked = await lookupCommonsFile(commonsClient(), fileTitle)
    } catch (error) {
      if (error instanceof CommonsError) {
        return sendError(reply, 502, 'commons_failed')
      }
      throw error
    }
    if (looked.status === 'missing') return call.missing()
    if (looked.status === 'rejected') {
      return sendError(reply, 422, 'license_not_allowed')
    }
    const { file } = looked
    if (await hasSourceImage(pool, spotId, file.descriptionUrl)) {
      return sendError(reply, 409, 'already_added')
    }

    const downloaded = await fetchWebImage(
      file.renditionUrl,
      { ...webOptions(), maxBytes: call.maxFileBytes },
      { hostAllowed: (host) => host === commonsRenditionHost },
    )
    if (!downloaded.ok) {
      // A rendition outside upload.wikimedia.org is an unusable answer, not
      // the user's fault.
      return downloaded.code === 'url_not_allowed'
        ? sendError(reply, 422, 'fetch_failed')
        : sendDownloadFailure(reply, downloaded.code, call.maxFileBytes)
    }
    return ingest(reply, userId, spotId, downloaded.bytes, call.maxFileBytes, {
      kind: 'commons',
      url:
        file.descriptionUrl.length <= webImageLimits.sourceUrl
          ? file.descriptionUrl
          : null,
      credit: file.artist ? file.artist.slice(0, webImageLimits.credit) : null,
      license: file.license.slice(0, webImageLimits.license) || null,
    })
  }

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
    const params = parseParams(idParams, request.params, reply)
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
    const params = parseParams(idParams, request.params, reply)
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
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const query = fileQuerySchema.safeParse(request.query)
    if (!query.success) {
      return sendError(reply, 400, 'invalid_request', {
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
      return sendError(reply, 403, 'forbidden')
    }
    const bytes = await readImageBytes(pool, storage, params.id)
    if (!bytes) return deny(reply, 404)
    return reply
      .header('cache-control', 'private, max-age=600')
      .type('image/webp')
      .send(bytes)
  })

  app.post(
    '/spots/:id/images',
    // The global limit stays 12 MiB; this route takes the largest allowed
    // file plus the multipart framing (R-43-02).
    { bodyLimit: fileSizeLimits.max + uploadOverhead },
    async (request, reply) => {
      const user = await requireUser(request, reply, pool, now(), secure)
      if (!user) return
      if (!originAllowed(request, config)) {
        return sendError(reply, 403, 'forbidden_origin')
      }
      const params = parseParams(idParams, request.params, reply)
      if (!params) return
      if (!(await uploadsEnabled(pool))) {
        return sendError(reply, 503, 'uploads_paused', {
          message: 'Uploads are paused',
        })
      }

      const maxFileBytes = await maxFileBytesFor(user.id)
      // A declared size beyond the limit is refused before the body is read.
      const declared = Number(request.headers['content-length'])
      if (declared > maxFileBytes + uploadOverhead) {
        return sendError(reply, 413, 'too_large', { maxFileBytes })
      }
      const file = await readUpload(request, reply, maxFileBytes)
      if (!file) return
      if (file.length > maxFileBytes) {
        return sendError(reply, 413, 'too_large', { maxFileBytes })
      }
      if (!sniffImage(file)) {
        return sendError(reply, 415, 'unsupported_media')
      }
      if (!limiter.allow(user.id, now())) {
        return sendError(reply, 429, 'rate_limited')
      }

      return ingest(reply, user.id, params.id, file, maxFileBytes)
    },
  )

  app.post('/spots/:id/images/from-url', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const access = await planSpotAccess(pool, params.id, user.id)
    if (!access.ok) return deny(reply, access.status)
    const web = webOptions()
    const body = imageFromUrlSchema.safeParse(request.body)
    const url = body.success
      ? parseWebUrl(body.data.url, webImageLimits.url, web.allowPort)
      : null
    if (!url) {
      return sendError(reply, 400, 'invalid_request', {
        fields: { url: 'invalid' },
      })
    }
    if (!(await uploadsEnabled(pool))) {
      return sendError(reply, 503, 'uploads_paused', {
        message: 'Uploads are paused',
      })
    }
    if (!limiter.allow(user.id, now())) {
      return sendError(reply, 429, 'rate_limited')
    }

    const maxFileBytes = await maxFileBytesFor(user.id)
    // A Commons or Wikipedia File: page is stored like a Commons pick (R-43-11).
    const page = wikimediaFileTitle(url)
    if (page) {
      return addCommonsFile(reply, user.id, params.id, page.fileTitle, {
        maxFileBytes,
        missing: () => sendError(reply, 422, 'fetch_failed'),
      })
    }

    // A Wikimedia original or large thumb is fetched as its 2048 px
    // rendition, and as the original when that rendition does not exist
    // (R-43-10).
    const fetchOptions = { ...web, maxBytes: maxFileBytes }
    const rendition = wikimediaRendition(url)
    let downloaded = await fetchWebImage(
      (rendition ?? url).toString(),
      fetchOptions,
    )
    if (rendition && !downloaded.ok && downloaded.code === 'fetch_failed') {
      downloaded = await fetchWebImage(url.toString(), fetchOptions)
    }
    if (!downloaded.ok) {
      return sendDownloadFailure(reply, downloaded.code, maxFileBytes)
    }
    const sourceUrl = rendition ? url.toString() : downloaded.finalUrl
    return ingest(reply, user.id, params.id, downloaded.bytes, maxFileBytes, {
      kind: 'url',
      url: sourceUrl.length <= webImageLimits.sourceUrl ? sourceUrl : null,
      credit: null,
      license: null,
    })
  })

  app.post('/spots/:id/images/from-commons', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const access = await planSpotAccess(pool, params.id, user.id)
    if (!access.ok) return deny(reply, access.status)
    const body = imageFromCommonsSchema.safeParse(request.body)
    if (!body.success || !body.data.fileTitle.startsWith('File:')) {
      return sendError(reply, 400, 'invalid_request', {
        fields: { fileTitle: 'invalid' },
      })
    }
    if (!(await uploadsEnabled(pool))) {
      return sendError(reply, 503, 'uploads_paused', {
        message: 'Uploads are paused',
      })
    }
    if (!limiter.allow(user.id, now())) {
      return sendError(reply, 429, 'rate_limited')
    }

    return addCommonsFile(reply, user.id, params.id, body.data.fileTitle, {
      maxFileBytes: await maxFileBytesFor(user.id),
      missing: () => deny(reply, 404),
    })
  })

  app.get('/trips/:id/photo-suggestions', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const access = await requireTripRole(pool, params.id, user.id, 'planner')
    if (!access.ok) return deny(reply, access.status)
    const query = suggestionQuerySchema.safeParse(request.query)
    if (!query.success) {
      return sendError(reply, 400, 'invalid_request', {
        fields: Object.fromEntries(
          query.error.issues.map((issue) => [issue.path.join('.'), 'invalid']),
        ),
      })
    }

    const key = pointKey(query.data.lat, query.data.lng)
    const cached = await pool.query<{ response: unknown }>(
      `
      SELECT response FROM commons_cache
      WHERE point_key = $1 AND created_at > $2::timestamptz - interval '7 days'
      `,
      [key, now()],
    )
    const hit = photoSuggestionListSchema.safeParse(cached.rows[0]?.response)
    if (hit.success) return hit.data

    let suggestions
    try {
      suggestions = await searchCommons(
        commonsClient(),
        query.data.lat,
        query.data.lng,
      )
    } catch (error) {
      if (error instanceof CommonsError) {
        return sendError(reply, 502, 'commons_failed')
      }
      throw error
    }
    const list = photoSuggestionListSchema.parse({ suggestions })
    await pool.query(
      `
      INSERT INTO commons_cache (point_key, response, created_at)
      VALUES ($1, $2::jsonb, $3)
      ON CONFLICT (point_key)
      DO UPDATE SET response = EXCLUDED.response, created_at = EXCLUDED.created_at
      `,
      [key, JSON.stringify(list), now()],
    )
    return list
  })

  app.delete('/images/:id', async (request, reply) => {
    const user = await requireUser(request, reply, pool, now(), secure)
    if (!user) return
    if (!originAllowed(request, config)) {
      return sendError(reply, 403, 'forbidden_origin')
    }
    const params = parseParams(idParams, request.params, reply)
    if (!params) return
    const result = await removeImage(pool, params.id, user.id)
    if (!result.ok) return deny(reply, result.status)
    return reply.code(204).send()
  })
}

// Multipart framing and form fields on top of the file itself.
const uploadOverhead = 2 * 1024 * 1024

function sendDownloadFailure(
  reply: FastifyReply,
  code: 'url_not_allowed' | 'fetch_failed' | 'too_large',
  maxFileBytes: number,
) {
  if (code === 'url_not_allowed') return sendError(reply, 400, code)
  if (code === 'too_large') {
    return sendError(reply, 413, 'too_large', { maxFileBytes })
  }
  return sendError(reply, 422, code)
}

async function readUpload(
  request: FastifyRequest,
  reply: FastifyReply,
  maxFileBytes: number,
): Promise<Buffer | null> {
  let file
  try {
    file = await request.file({ limits: { fileSize: maxFileBytes } })
  } catch {
    sendError(reply, 400, 'invalid_request', { fields: { file: 'invalid' } })
    return null
  }
  if (!file) {
    sendError(reply, 400, 'invalid_request', { fields: { file: 'empty' } })
    return null
  }
  const chunks: Buffer[] = []
  for await (const chunk of file.file) chunks.push(Buffer.from(chunk))
  if (file.file.truncated) {
    sendError(reply, 413, 'too_large', { maxFileBytes })
    return null
  }
  return Buffer.concat(chunks)
}
