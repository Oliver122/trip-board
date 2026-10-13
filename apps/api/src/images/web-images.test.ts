import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { plainText, licenseAllowed } from './commons.js'
import { createS3Storage, type ObjectStorage } from './storage.js'
import { isPublicAddress, type WebFetchOptions } from './web-fetch.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'

const honshu = {
  name: 'Honshu',
  timezone: 'Asia/Tokyo',
  region: { bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 } },
}

type CommonsFile = {
  title: string
  mime?: string
  license?: string
  artist?: string
  rendition?: string
}

describe('web photos', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let strictApp: FastifyInstance
  let config: AppConfig
  let storage: ObjectStorage
  let jpeg: Buffer
  let failInsert = false
  let counter = 0
  const now = new Date('2026-06-01T00:00:00.000Z')

  let fixture: http.Server
  let fixturePort = 0
  let fixtureHits = 0
  let bigClosed = false
  let listener: http.Server
  let listenerHits = 0
  let listenerPort = 0

  // Mutated by tests; the routes read these options on every request.
  const web: WebFetchOptions = {}
  let renditionCalls = 0
  let commonsCalls = 0
  let commonsStatus = 200
  let commonsFiles: CommonsFile[] = []
  let commonsSearch: string[] = []
  let currentNow = now

  beforeAll(async () => {
    jpeg = await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 3,
        background: { r: 12, g: 80, b: 140 },
      },
    })
      .jpeg()
      .toBuffer()

    fixture = http.createServer((req, res) => {
      fixtureHits += 1
      const path = req.url ?? '/'
      const redirect = (to: string) => {
        res.writeHead(302, { location: to })
        res.end()
      }
      if (path === '/a.jpg') return redirect('/b.jpg')
      if (path === '/r1') return redirect('/r2')
      if (path === '/r2') return redirect('/r3')
      if (path === '/r3') return redirect('/r4')
      if (path === '/r4') return redirect('/b.jpg')
      if (path === '/b.jpg') {
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        return res.end(jpeg)
      }
      if (path === '/doc.pdf') {
        res.writeHead(200, { 'content-type': 'application/pdf' })
        return res.end(Buffer.from('%PDF-1.4 not an image'))
      }
      if (path === '/big') {
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.on('close', () => {
          bigClosed = true
        })
        const chunk = Buffer.alloc(64 * 1024, 1)
        let sent = 0
        const pump = () => {
          while (sent < 11 * 1024 * 1024 && !res.destroyed) {
            sent += chunk.length
            if (!res.write(chunk)) return void res.once('drain', pump)
          }
          res.end()
        }
        return pump()
      }
      if (path === '/slow') return // never answers
      res.writeHead(404)
      res.end()
    })
    await new Promise<void>((done) => fixture.listen(0, '127.0.0.1', done))
    fixturePort = (fixture.address() as AddressInfo).port

    listener = http.createServer((_req, res) => {
      listenerHits += 1
      res.writeHead(200)
      res.end()
    })
    await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done))
    listenerPort = (listener.address() as AddressInfo).port

    db = await createTestDatabase()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
      S3_BUCKET: 'tripboard-test',
    })
    storage = createS3Storage(config)

    app = await buildApp(db.pool, {
      config,
      now: () => currentNow,
      storage,
      beforeImageInsert: async () => {
        if (failInsert) throw new Error('insert failed')
      },
      webFetch: web,
      commonsFetch: async (input) => {
        commonsCalls += 1
        const url = new URL(String(input))
        if (commonsStatus !== 200) {
          return new Response('nope', { status: commonsStatus })
        }
        if (url.searchParams.get('list') === 'geosearch') {
          return json({
            query: {
              geosearch: commonsFiles.map((file) => ({ title: file.title })),
            },
          })
        }
        commonsSearch.push(url.searchParams.get('titles') ?? '')
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

    // The real resolver and the real address checks, only the port is opened.
    strictApp = await buildApp(db.pool, {
      config,
      now: () => currentNow,
      storage,
      webFetch: {
        allowPort: (port) => port === listenerPort,
        resolveHost: async (host) =>
          host === 'internal.test' ? ['192.168.1.2'] : ['93.184.216.34'],
        intercept: (url) =>
          url.hostname === 'public.test'
            ? {
                status: 302,
                headers: { location: `http://127.0.0.1:${listenerPort}/` },
              }
            : null,
      },
    })
  }, 60_000)

  afterAll(async () => {
    await app?.close()
    await strictApp?.close()
    await clearMyBlobs().catch(() => undefined)
    await new Promise((done) => fixture?.close(done))
    await new Promise((done) => listener?.close(done))
    await db?.pool.end()
    await db?.drop()
  })

  beforeEach(async () => {
    failInsert = false
    currentNow = now
    fixtureHits = 0
    listenerHits = 0
    bigClosed = false
    renditionCalls = 0
    commonsCalls = 0
    commonsStatus = 200
    commonsFiles = []
    commonsSearch = []
    for (const key of Object.keys(web))
      delete (web as Record<string, unknown>)[key]
    Object.assign(web, {
      resolveHost: async () => ['127.0.0.1'],
      allowAddress: (address: string) => address === '127.0.0.1',
      allowPort: () => true,
      timeoutMs: 500,
      intercept: (url: URL) => {
        if (url.hostname !== 'upload.wikimedia.org') return null
        renditionCalls += 1
        return { status: 200, body: jpeg }
      },
    } satisfies WebFetchOptions)
    await db.pool.query(`
      DELETE FROM plan_entry_spots;
      DELETE FROM images;
      DELETE FROM plan_entries;
      DELETE FROM spots;
      DELETE FROM trip_invites;
      DELETE FROM trip_members;
      DELETE FROM trips;
      DELETE FROM activity_events;
      DELETE FROM blob_deletions;
      DELETE FROM commons_cache;
      DELETE FROM sessions;
      DELETE FROM users;
      UPDATE app_settings
      SET uploads_enabled = true, default_max_images = 100, default_max_bytes = 209715200;
    `)
    await clearMyBlobs()
  })

  const url = (path: string) => `http://127.0.0.1:${fixturePort}${path}`

  it('T-34-01 stores a redirected URL photo with its source and one event', async () => {
    const owner = await newUser()
    const spotId = await newSpot(owner)
    const response = await fromUrl(owner, spotId, url('/a.jpg'))
    expect(response.statusCode).toBe(201)
    const image = response.json()
    expect(image).toMatchObject({
      width: 2048,
      height: 1536,
      sourceUrl: url('/b.jpg'),
      credit: null,
      license: null,
    })
    const events = await db.pool.query(
      `SELECT metadata FROM activity_events WHERE action = 'image.upload' AND entity_id = $1`,
      [image.id],
    )
    expect(events.rows).toHaveLength(1)
    expect(events.rows[0].metadata).toMatchObject({ source: 'url' })

    const list = await app.inject({
      method: 'GET',
      url: `/spots/${spotId}/images`,
      headers: { cookie: owner.cookie },
    })
    expect(list.json().images[0]).toMatchObject({ sourceUrl: url('/b.jpg') })
    const one = await app.inject({
      method: 'GET',
      url: `/images/${image.id}`,
      headers: { cookie: owner.cookie },
    })
    expect(one.json()).toMatchObject({ sourceUrl: url('/b.jpg') })
  })

  it('T-34-01 rolls the image and the event back on a forced database error', async () => {
    const owner = await newUser()
    const spotId = await newSpot(owner)
    failInsert = true
    const response = await fromUrl(owner, spotId, url('/b.jpg'))
    expect(response.statusCode).toBe(500)
    const count = await db.pool.query(
      `SELECT (SELECT count(*) FROM images)::int AS images,
              (SELECT count(*) FROM activity_events WHERE action = 'image.upload')::int AS events`,
    )
    expect(count.rows[0]).toEqual({ images: 0, events: 0 })
    expect(await myBlobs()).toEqual([])
  })

  it('T-34-01 a data-free upload keeps source, credit and license null', async () => {
    const owner = await newUser()
    const spotId = await newSpot(owner)
    const response = await fromUrl(owner, spotId, url('/b.jpg'))
    expect(response.statusCode).toBe(201)
    expect(response.json().credit).toBeNull()
  })

  it('T-34-02 maps download problems to the upload codes', async () => {
    const owner = await newUser()
    const spotId = await newSpot(owner)

    const pdf = await fromUrl(owner, spotId, url('/doc.pdf'))
    expect(pdf.statusCode).toBe(415)

    const big = await fromUrl(owner, spotId, url('/big'))
    expect(big.statusCode).toBe(413)
    expect(big.json()).toEqual({ error: 'too_large' })
    await waitFor(() => bigClosed)

    const missing = await fromUrl(owner, spotId, url('/nothing'))
    expect(missing.statusCode).toBe(422)
    expect(missing.json()).toMatchObject({ error: 'fetch_failed' })

    const loop = await fromUrl(owner, spotId, url('/r1'))
    expect(loop.statusCode).toBe(422)
    expect(loop.json()).toMatchObject({ error: 'fetch_failed' })

    web.timeoutMs = 150
    const slow = await fromUrl(owner, spotId, url('/slow'))
    expect(slow.statusCode).toBe(422)
    expect(slow.json()).toMatchObject({ error: 'fetch_failed' })
    expect(await imageCount()).toBe(0)
  })

  it('T-34-02 validates the url field', async () => {
    const owner = await newUser()
    const spotId = await newSpot(owner)
    // Without the test hook only ports 80 and 443 pass.
    delete web.allowPort
    for (const bad of [
      'ftp://example.com/a.jpg',
      'http://example.com:8080/a.jpg',
      `http://example.com/${'a'.repeat(2001)}`,
      'not a url',
      '',
    ]) {
      const response = await fromUrl(owner, spotId, bad)
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ fields: { url: 'invalid' } })
    }
    const missing = await app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images/from-url`,
      headers: jsonHeaders(owner.cookie),
      payload: {},
    })
    expect(missing.statusCode).toBe(400)
  })

  it('T-34-02 checks roles, pause and quota', async () => {
    const owner = await newUser()
    const visitor = await newUser()
    const stranger = await newUser()
    const tripId = await newTrip(owner)
    await addMember(tripId, visitor.user.id, 'visitor')
    const spotId = await newSpot(owner, tripId)

    expect((await fromUrl(visitor, spotId, url('/b.jpg'))).statusCode).toBe(403)
    expect((await fromUrl(stranger, spotId, url('/b.jpg'))).statusCode).toBe(
      404,
    )
    const unknown = await fromUrl(
      owner,
      '00000000-0000-0000-0000-00000000dead',
      url('/b.jpg'),
    )
    expect(unknown.statusCode).toBe(404)
    const anonymous = await app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images/from-url`,
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { url: url('/b.jpg') },
    })
    expect(anonymous.statusCode).toBe(401)
    expect(fixtureHits).toBe(0)

    await db.pool.query('UPDATE app_settings SET uploads_enabled = false')
    const paused = await fromUrl(owner, spotId, url('/b.jpg'))
    expect(paused.statusCode).toBe(503)
    expect(paused.json()).toMatchObject({ error: 'uploads_paused' })
    await db.pool.query('UPDATE app_settings SET uploads_enabled = true')

    await db.pool.query('UPDATE users SET max_images = 0 WHERE id = $1', [
      owner.user.id,
    ])
    const full = await fromUrl(owner, spotId, url('/b.jpg'))
    expect(full.statusCode).toBe(413)
    expect(full.json()).toMatchObject({ error: 'quota_exceeded' })
    expect(await imageCount()).toBe(0)
  })

  it('T-34-03 refuses non-public addresses and sends no request to them', async () => {
    const owner = await newUser()
    const spotId = await newSpot(owner)
    const send = (target: string) =>
      strictApp.inject({
        method: 'POST',
        url: `/spots/${spotId}/images/from-url`,
        headers: jsonHeaders(owner.cookie),
        payload: { url: target },
      })
    for (const target of [
      `http://127.0.0.1:${listenerPort}/`,
      'http://127.0.0.1/',
      'http://10.0.0.5/',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://internal.test/a.jpg',
      'http://public.test/a.jpg',
    ]) {
      const response = await send(target)
      expect(response.statusCode, target).toBe(400)
      expect(response.json(), target).toMatchObject({
        error: 'url_not_allowed',
      })
    }
    expect(listenerHits).toBe(0)
    expect(await imageCount()).toBe(0)
  })

  it('T-34-03 classifies addresses', () => {
    for (const blocked of [
      '127.0.0.1',
      '0.0.0.0',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '::1',
      'fe80::1',
      'fd12:3456::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '::ffff:a9fe:a9fe',
      '2001:db8::1',
      '2002:7f00:1::',
    ]) {
      expect(isPublicAddress(blocked), blocked).toBe(false)
    }
    for (const open of [
      '93.184.216.34',
      '8.8.8.8',
      '172.32.0.1',
      '100.128.0.1',
      '2606:4700:4700::1111',
      '::ffff:8.8.8.8',
    ]) {
      expect(isPublicAddress(open), open).toBe(true)
    }
  })

  it('T-34-06 returns up to 8 filtered suggestions and caches them', async () => {
    const owner = await newUser()
    const tripId = await newTrip(owner)
    commonsFiles = [
      ...Array.from({ length: 9 }, (_, index) => ({
        title: `File:Temple ${index}.jpg`,
        artist:
          index === 0 ? '<a href="//x">Jane &amp; <b>Doe</b></a>' : 'Poster',
        license: index % 2 ? 'CC BY-SA 4.0' : 'CC BY 2.0',
      })),
      { title: 'File:Anim.gif', mime: 'image/gif' },
      { title: 'File:NC.jpg', license: 'CC BY-NC 4.0' },
      { title: 'File:Fair.jpg', license: 'Fair use' },
    ]
    const first = await suggestions(owner, tripId, 35.0394, 135.7292)
    expect(first.statusCode).toBe(200)
    const list = first.json().suggestions
    expect(list).toHaveLength(8)
    expect(
      list.map((item: { fileTitle: string }) => item.fileTitle),
    ).not.toContain('File:Anim.gif')
    expect(list[0]).toMatchObject({
      fileTitle: 'File:Temple 0.jpg',
      artist: 'Jane & Doe',
      license: 'CC BY 2.0',
      width: 4000,
      height: 3000,
    })
    expect(list[0].descriptionUrl).toContain('commons.wikimedia.org')
    const calls = commonsCalls

    const second = await suggestions(owner, tripId, 35.03941, 135.72919)
    expect(second.json()).toEqual(first.json())
    expect(commonsCalls).toBe(calls)

    // An old row is refetched (and the cleanup job removes rows it leaves).
    await db.pool.query(
      `UPDATE commons_cache SET created_at = $1::timestamptz - interval '8 days'`,
      [now],
    )
    const third = await suggestions(owner, tripId, 35.0394, 135.7292)
    expect(third.statusCode).toBe(200)
    expect(commonsCalls).toBeGreaterThan(calls)
    const rows = await db.pool.query(
      'SELECT point_key, created_at FROM commons_cache',
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].point_key).toBe('35.0394,135.7292')
    expect(new Date(rows.rows[0].created_at).getTime()).toBe(now.getTime())
  })

  it('T-34-06 checks input, roles and upstream errors', async () => {
    const owner = await newUser()
    const visitor = await newUser()
    const stranger = await newUser()
    const tripId = await newTrip(owner)
    await addMember(tripId, visitor.user.id, 'visitor')

    expect((await suggestions(visitor, tripId, 35, 135)).statusCode).toBe(403)
    expect((await suggestions(stranger, tripId, 35, 135)).statusCode).toBe(404)
    expect(
      (
        await suggestions(
          owner,
          '00000000-0000-0000-0000-00000000dead',
          35,
          135,
        )
      ).statusCode,
    ).toBe(404)
    const anonymous = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}/photo-suggestions?lat=35&lng=135`,
    })
    expect(anonymous.statusCode).toBe(401)
    for (const [lat, lng] of [
      [91, 0],
      [0, 181],
      [Number.NaN, 0],
    ]) {
      const response = await suggestions(
        owner,
        tripId,
        lat as number,
        lng as number,
      )
      expect(response.statusCode).toBe(400)
    }
    expect(commonsCalls).toBe(0)

    commonsStatus = 500
    const failed = await suggestions(owner, tripId, 35, 135)
    expect(failed.statusCode).toBe(502)
    expect(failed.json()).toMatchObject({ error: 'commons_failed' })
    const cached = await db.pool.query('SELECT 1 FROM commons_cache')
    expect(cached.rowCount).toBe(0)
  })

  it('T-34-06 helpers keep only reusable licenses and plain text', () => {
    for (const ok of [
      'CC0',
      'CC0 1.0',
      'Public domain',
      'CC BY 2.0',
      'CC BY-SA 4.0',
      'CC BY-SA 3.0 de',
    ]) {
      expect(licenseAllowed(ok), ok).toBe(true)
    }
    for (const no of [
      'CC BY-NC 4.0',
      'CC BY-ND 2.0',
      'CC BY-NC-SA 3.0',
      'Fair use',
      'GFDL',
      '',
    ]) {
      expect(licenseAllowed(no), no).toBe(false)
    }
    expect(plainText('<a href="x">A &amp; B</a> &#169; &lt;3')).toBe(
      'A & B © <3',
    )
  })

  it('T-34-07 stores a Commons photo with credit, license and an event', async () => {
    const owner = await newUser()
    const spotId = await newSpot(owner)
    commonsFiles = [
      {
        title: 'File:Kinkaku-ji.jpg',
        artist: 'Jane Doe',
        license: 'CC BY-SA 4.0',
      },
    ]
    const response = await fromCommons(owner, spotId, 'File:Kinkaku-ji.jpg')
    expect(response.statusCode).toBe(201)
    const image = response.json()
    expect(image).toMatchObject({
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kinkaku-ji.jpg',
      credit: 'Jane Doe',
      license: 'CC BY-SA 4.0',
      width: 2048,
    })
    expect(renditionCalls).toBe(1)
    const events = await db.pool.query(
      `SELECT metadata FROM activity_events WHERE action = 'image.upload' AND entity_id = $1`,
      [image.id],
    )
    expect(events.rows[0].metadata).toMatchObject({ source: 'commons' })

    const again = await fromCommons(owner, spotId, 'File:Kinkaku-ji.jpg')
    expect(again.statusCode).toBe(409)
    expect(again.json()).toEqual({ error: 'already_added' })
    expect(await imageCount()).toBe(1)
  })

  it('T-34-07 rejects licenses and renditions it cannot trust', async () => {
    const owner = await newUser()
    const spotId = await newSpot(owner)
    commonsFiles = [
      { title: 'File:NC.jpg', license: 'CC BY-NC 4.0' },
      { title: 'File:Anim.gif', mime: 'image/gif' },
      { title: 'File:Evil.jpg', rendition: 'http://127.0.0.1/secret.jpg' },
      { title: 'File:Other.jpg', rendition: 'https://example.com/a.jpg' },
    ]
    const nc = await fromCommons(owner, spotId, 'File:NC.jpg')
    expect(nc.statusCode).toBe(422)
    expect(nc.json()).toEqual({ error: 'license_not_allowed' })
    expect((await fromCommons(owner, spotId, 'File:Anim.gif')).statusCode).toBe(
      422,
    )

    for (const title of ['File:Evil.jpg', 'File:Other.jpg']) {
      const response = await fromCommons(owner, spotId, title)
      expect(response.statusCode, title).toBe(422)
    }
    expect(renditionCalls).toBe(0)
    expect(fixtureHits).toBe(0)

    expect((await fromCommons(owner, spotId, 'File:Gone.jpg')).statusCode).toBe(
      404,
    )
    const bad = await app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images/from-commons`,
      headers: jsonHeaders(owner.cookie),
      payload: { fileTitle: 'Kinkaku-ji.jpg' },
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json()).toMatchObject({ fields: { fileTitle: 'invalid' } })
    commonsStatus = 500
    const down = await fromCommons(owner, spotId, 'File:NC.jpg')
    expect(down.statusCode).toBe(502)
    expect(down.json()).toMatchObject({ error: 'commons_failed' })
    expect(await imageCount()).toBe(0)
  })

  it('T-34-07 checks roles, pause and quota', async () => {
    const owner = await newUser()
    const visitor = await newUser()
    const stranger = await newUser()
    const tripId = await newTrip(owner)
    await addMember(tripId, visitor.user.id, 'visitor')
    const spotId = await newSpot(owner, tripId)
    commonsFiles = [{ title: 'File:A.jpg' }]

    expect((await fromCommons(visitor, spotId, 'File:A.jpg')).statusCode).toBe(
      403,
    )
    expect((await fromCommons(stranger, spotId, 'File:A.jpg')).statusCode).toBe(
      404,
    )
    const anonymous = await app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images/from-commons`,
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { fileTitle: 'File:A.jpg' },
    })
    expect(anonymous.statusCode).toBe(401)

    await db.pool.query('UPDATE app_settings SET uploads_enabled = false')
    expect((await fromCommons(owner, spotId, 'File:A.jpg')).statusCode).toBe(
      503,
    )
    await db.pool.query('UPDATE app_settings SET uploads_enabled = true')
    await db.pool.query('UPDATE users SET max_images = 0 WHERE id = $1', [
      owner.user.id,
    ])
    expect((await fromCommons(owner, spotId, 'File:A.jpg')).statusCode).toBe(
      413,
    )
  })

  it('serves the NODE_ENV=test fixtures and the built-in Commons answers', async () => {
    const jpg = await app.inject({
      method: 'GET',
      url: '/test/fixtures/photo.jpg',
    })
    expect(jpg.statusCode).toBe(200)
    const meta = await sharp(jpg.rawPayload).metadata()
    expect([meta.width, meta.height]).toEqual([4000, 3000])
    const thumb = await sharp(
      (await app.inject({ method: 'GET', url: '/test/fixtures/thumb.jpg' }))
        .rawPayload,
    ).metadata()
    expect(thumb.width).toBe(320)
    expect(
      (await app.inject({ method: 'GET', url: '/test/fixtures/photo.png' }))
        .statusCode,
    ).toBe(200)
    const redirect = await app.inject({
      method: 'GET',
      url: '/test/fixtures/redirect.jpg',
    })
    expect(redirect.statusCode).toBe(302)
    expect(
      (await app.inject({ method: 'GET', url: '/test/fixtures/other.jpg' }))
        .statusCode,
    ).toBe(404)

    // No webFetch and no commonsFetch injected: the built-in seam answers.
    const seamApp = await buildApp(db.pool, {
      config,
      now: () => currentNow,
      storage,
    })
    try {
      const owner = await newUser()
      const tripId = await newTrip(owner)
      const spotId = await newSpot(owner, tripId)
      const near = await seamApp.inject({
        method: 'GET',
        url: `/trips/${tripId}/photo-suggestions?lat=35.0394&lng=135.7292`,
        headers: { cookie: owner.cookie },
      })
      const titles = near
        .json()
        .suggestions.map((s: { fileTitle: string }) => s.fileTitle)
      expect(titles).toEqual([
        'File:Kinkaku-ji Golden Pavilion.jpg',
        'File:Kinkaku-ji pond.jpg',
        'File:Kinkaku-ji in snow.jpg',
      ])
      expect(near.json().suggestions[0]).toMatchObject({
        artist: 'Jane Doe',
        license: 'CC BY-SA 4.0',
        thumbUrl: `${WEB_ORIGIN}/api/test/fixtures/thumb.jpg`,
      })
      const far = await seamApp.inject({
        method: 'GET',
        url: `/trips/${tripId}/photo-suggestions?lat=35.7&lng=139.7`,
        headers: { cookie: owner.cookie },
      })
      expect(far.json().suggestions).toEqual([])

      const post = (path: string, payload: object) =>
        seamApp.inject({
          method: 'POST',
          url: `/spots/${spotId}/images/${path}`,
          headers: jsonHeaders(owner.cookie),
          payload,
        })
      const added = await post('from-url', {
        url: 'http://fixtures.tripboard.test/redirect.jpg',
      })
      expect(added.statusCode).toBe(201)
      expect(added.json().sourceUrl).toBe(
        'http://fixtures.tripboard.test/photo.jpg',
      )
      expect(
        (
          await post('from-url', {
            url: 'http://fixtures.tripboard.test/nope.jpg',
          })
        ).statusCode,
      ).toBe(422)
      const commons = await post('from-commons', {
        fileTitle: 'File:Kinkaku-ji pond.jpg',
      })
      expect(commons.statusCode).toBe(201)
      expect(commons.json()).toMatchObject({
        credit: 'John Roe',
        license: 'CC BY 2.0',
      })
      expect(
        (
          await post('from-commons', {
            fileTitle: 'File:Kinkaku-ji commercial.jpg',
          })
        ).statusCode,
      ).toBe(422)
    } finally {
      await seamApp.close()
    }
  })

  // The bucket is shared with the other image tests, which run in parallel.
  const tripIds = new Set<string>()
  async function myBlobs() {
    const keys = await storage.list()
    return keys.filter((key) =>
      [...tripIds].some((id) => key.startsWith(`trips/${id}/`)),
    )
  }
  async function clearMyBlobs() {
    await Promise.all((await myBlobs()).map((key) => storage.delete(key)))
  }

  async function newUser() {
    counter += 1
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: {
        discordId: `1000000000003${String(counter).padStart(5, '0')}`,
      },
    })
    expect(response.statusCode).toBe(200)
    return {
      cookie: sessionHeader(response),
      user: response.json() as { id: string },
    }
  }

  async function newTrip(user: { cookie: string }): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: jsonHeaders(user.cookie),
      payload: honshu,
    })
    expect(response.statusCode).toBe(201)
    const id = response.json().id as string
    tripIds.add(id)
    return id
  }

  async function newSpot(
    user: { cookie: string },
    tripId?: string,
  ): Promise<string> {
    const trip = tripId ?? (await newTrip(user))
    const response = await app.inject({
      method: 'POST',
      url: `/trips/${trip}/spots`,
      headers: jsonHeaders(user.cookie),
      payload: {
        title: 'Temple',
        lat: 35.0394,
        lng: 135.7292,
        baseCategory: 'must_go',
      },
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  async function addMember(tripId: string, userId: string, role: string) {
    await db.pool.query(
      'INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, $3)',
      [tripId, userId, role],
    )
  }

  function fromUrl(user: { cookie: string }, spotId: string, target: string) {
    return app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images/from-url`,
      headers: jsonHeaders(user.cookie),
      payload: { url: target },
    })
  }

  function fromCommons(
    user: { cookie: string },
    spotId: string,
    title: string,
  ) {
    return app.inject({
      method: 'POST',
      url: `/spots/${spotId}/images/from-commons`,
      headers: jsonHeaders(user.cookie),
      payload: { fileTitle: title },
    })
  }

  function suggestions(
    user: { cookie: string },
    tripId: string,
    lat: number,
    lng: number,
  ) {
    return app.inject({
      method: 'GET',
      url: `/trips/${tripId}/photo-suggestions?lat=${lat}&lng=${lng}`,
      headers: { cookie: user.cookie },
    })
  }

  async function imageCount(): Promise<number> {
    const result = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM images',
    )
    return result.rows[0]?.n ?? 0
  }
})

function commonsPage(file: CommonsFile) {
  const slug = file.title.replace(/^File:/, '').replaceAll(' ', '_')
  const rendition =
    file.rendition ??
    `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${slug}/2048px-${slug}`
  return {
    title: file.title,
    imageinfo: [
      {
        thumburl: rendition,
        url: rendition,
        width: 4000,
        height: 3000,
        mime: file.mime ?? 'image/jpeg',
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

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 50 && !condition(); attempt += 1) {
    await new Promise((done) => setTimeout(done, 20))
  }
  expect(condition()).toBe(true)
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
