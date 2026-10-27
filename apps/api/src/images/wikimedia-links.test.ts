import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { createS3Storage, type ObjectStorage } from './storage.js'
import type { InterceptResponse, WebFetchOptions } from './web-fetch.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'
const uploadBase = 'https://upload.wikimedia.org/wikipedia/commons'
const original = `${uploadBase}/a/ab/Kinkaku-ji.jpg`
const thumb = `${uploadBase}/thumb/a/ab/Kinkaku-ji.jpg/2048px-Kinkaku-ji.jpg`

const honshu = {
  name: 'Honshu',
  timezone: 'Asia/Tokyo',
  region: { bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 } },
}

type CommonsFile = { title: string; license?: string; artist?: string }

describe('wikimedia links in from-url', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let privateApp: FastifyInstance
  let storage: ObjectStorage
  let counter = 0
  let jpeg: Buffer
  // Mutated by tests; the routes read these on every request.
  const web: WebFetchOptions = {}
  let served: Record<string, InterceptResponse> = {}
  let requested: string[] = []
  let commonsFiles: CommonsFile[] = []

  beforeAll(async () => {
    jpeg = await sharp({
      create: {
        width: 3000,
        height: 2000,
        channels: 3,
        background: { r: 12, g: 80, b: 140 },
      },
    })
      .jpeg()
      .toBuffer()

    db = await createTestDatabase()
    const config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
      S3_BUCKET: 'tripboard-test',
    })
    storage = createS3Storage(config)
    app = await buildApp(db.pool, {
      config,
      storage,
      webFetch: web,
      commonsFetch: async (input) => {
        const url = new URL(String(input))
        const titles = (url.searchParams.get('titles') ?? '').split('|')
        return json({
          query: {
            pages: commonsFiles
              .filter((file) => titles.includes(file.title))
              .map((file) => commonsPage(file)),
          },
        })
      },
    })
    // The real address checks: the host resolves to a private address.
    privateApp = await buildApp(db.pool, {
      config,
      storage,
      webFetch: { resolveHost: async () => ['192.168.1.2'] },
    })
  }, 60_000)

  afterAll(async () => {
    await app?.close()
    await privateApp?.close()
    await db?.pool.end()
    await db?.drop()
  })

  beforeEach(() => {
    served = {}
    requested = []
    commonsFiles = []
    for (const key of Object.keys(web))
      delete (web as Record<string, unknown>)[key]
    Object.assign(web, {
      resolveHost: async () => ['127.0.0.1'],
      allowAddress: (address: string) => address === '127.0.0.1',
      allowPort: () => true,
      timeoutMs: 500,
      intercept: (url: URL) => {
        if (url.hostname !== 'upload.wikimedia.org') return null
        requested.push(url.toString())
        return served[url.toString()] ?? { status: 404 }
      },
    } satisfies WebFetchOptions)
  })

  it('T-43-08 downloads the 2048 px thumb of an original and keeps the given URL', async () => {
    served[original] = { status: 200, body: Buffer.alloc(15 * 1024 * 1024, 1) }
    served[thumb] = { status: 200, body: jpeg }
    const owner = await newUser()
    const spotId = await newSpot(owner)

    const response = await fromUrl(owner, spotId, original)
    expect(response.statusCode).toBe(201)
    expect(response.json().sourceUrl).toBe(original)
    expect(requested).toEqual([thumb])
  })

  it('T-43-08 falls back to the original when the thumb answers 404', async () => {
    served[original] = { status: 200, body: jpeg }
    const owner = await newUser()
    const spotId = await newSpot(owner)

    const response = await fromUrl(owner, spotId, original)
    expect(response.statusCode).toBe(201)
    expect(response.json().sourceUrl).toBe(original)
    expect(requested).toEqual([thumb, original])
  })

  it('T-43-08 refuses a rewritten URL that resolves to a private address', async () => {
    const owner = await newUser()
    const spotId = await newSpot(owner)

    const response = await privateApp.inject({
      method: 'POST',
      url: `/spots/${spotId}/images/from-url`,
      headers: jsonHeaders(owner.cookie),
      payload: { url: original },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'url_not_allowed' })
  })

  it('T-43-09 stores a Commons File: link and a Wikipedia media link like a pick', async () => {
    commonsFiles = [
      { title: 'File:Kinkaku-ji 2019.jpg', artist: 'Jane Doe' },
      { title: 'File:Ryoan-ji.jpg', license: 'Public domain' },
    ]
    for (const file of commonsFiles) {
      const slug = file.title.replace(/^File:/, '').replaceAll(' ', '_')
      served[`${uploadBase}/thumb/a/ab/${slug}/2048px-${slug}`] = {
        status: 200,
        body: jpeg,
      }
    }
    const owner = await newUser()
    const spotId = await newSpot(owner)

    const page = await fromUrl(
      owner,
      spotId,
      'https://commons.wikimedia.org/wiki/File:Kinkaku-ji_2019.jpg',
    )
    expect(page.statusCode).toBe(201)
    expect(page.json()).toMatchObject({
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kinkaku-ji_2019.jpg',
      credit: 'Jane Doe',
      license: 'CC BY 4.0',
    })
    const events = await db.pool.query(
      `SELECT metadata FROM activity_events WHERE action = 'image.upload' AND entity_id = $1`,
      [page.json().id],
    )
    expect(events.rows[0].metadata).toMatchObject({ source: 'commons' })

    const media = await fromUrl(
      owner,
      spotId,
      'https://en.wikipedia.org/wiki/Ryoan-ji#/media/File:Ryoan-ji.jpg',
    )
    expect(media.statusCode).toBe(201)
    expect(media.json()).toMatchObject({
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ryoan-ji.jpg',
      license: 'Public domain',
    })
  })

  it('T-43-09 rejects non-free licenses, repeats and files Commons does not know', async () => {
    commonsFiles = [
      { title: 'File:A.jpg' },
      { title: 'File:NC.jpg', license: 'CC BY-NC 4.0' },
    ]
    served[`${uploadBase}/thumb/a/ab/A.jpg/2048px-A.jpg`] = {
      status: 200,
      body: jpeg,
    }
    const owner = await newUser()
    const spotId = await newSpot(owner)
    const link = (name: string) =>
      `https://commons.wikimedia.org/wiki/File:${name}`

    const nonFree = await fromUrl(owner, spotId, link('NC.jpg'))
    expect(nonFree.statusCode).toBe(422)
    expect(nonFree.json()).toMatchObject({ error: 'license_not_allowed' })

    expect((await fromUrl(owner, spotId, link('A.jpg'))).statusCode).toBe(201)
    const again = await fromUrl(owner, spotId, link('A.jpg'))
    expect(again.statusCode).toBe(409)
    expect(again.json()).toEqual({ error: 'already_added' })

    const unknown = await fromUrl(
      owner,
      spotId,
      'https://de.wikipedia.org/wiki/Datei:Lokal.jpg',
    )
    expect(unknown.statusCode).toBe(422)
    expect(unknown.json()).toMatchObject({ error: 'fetch_failed' })
  })

  async function newUser() {
    counter += 1
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: {
        discordId: `1000000000004${String(counter).padStart(5, '0')}`,
      },
    })
    expect(response.statusCode).toBe(200)
    return { cookie: sessionHeader(response) }
  }

  async function newSpot(user: { cookie: string }): Promise<string> {
    const trip = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: jsonHeaders(user.cookie),
      payload: honshu,
    })
    expect(trip.statusCode).toBe(201)
    const spot = await app.inject({
      method: 'POST',
      url: `/trips/${trip.json().id}/spots`,
      headers: jsonHeaders(user.cookie),
      payload: {
        title: 'Temple',
        lat: 35.0394,
        lng: 135.7292,
        baseCategory: 'must_go',
      },
    })
    expect(spot.statusCode).toBe(201)
    return spot.json().id as string
  }

  function fromUrl(user: { cookie: string }, spotId: string, target: string) {
    return app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images/from-url`,
      headers: jsonHeaders(user.cookie),
      payload: { url: target },
    })
  }
})

function commonsPage(file: CommonsFile) {
  const slug = file.title.replace(/^File:/, '').replaceAll(' ', '_')
  const rendition = `${uploadBase}/thumb/a/ab/${slug}/2048px-${slug}`
  return {
    title: file.title,
    imageinfo: [
      {
        thumburl: rendition,
        url: rendition,
        width: 4000,
        height: 3000,
        mime: 'image/jpeg',
        descriptionurl: `https://commons.wikimedia.org/wiki/File:${slug}`,
        extmetadata: {
          Artist: { value: file.artist ?? 'Someone' },
          LicenseShortName: { value: file.license ?? 'CC BY 4.0' },
        },
      },
    ],
  }
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  })
}

function jsonHeaders(cookie: string) {
  return { cookie, origin: WEB_ORIGIN, 'content-type': 'application/json' }
}

function sessionHeader(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  const cookie = list.find((value) => value.startsWith('tb_session=')) ?? ''
  const pair = cookie.split(';')[0] ?? ''
  return `tb_session=${pair.slice(pair.indexOf('=') + 1)}`
}
