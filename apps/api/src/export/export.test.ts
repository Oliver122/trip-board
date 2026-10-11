import { parse } from 'csv-parse/sync'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import ICAL from 'ical.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { extractText, getDocumentProxy } from 'unpdf'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { seedDatabase } from '../db/seed.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'
const seedTrip = '10000000-0000-0000-0000-000000000001'
const exportedOn = '2026-06-01T03:00:00.000Z'

const enHeaders = [
  'Title',
  'Category',
  'Address',
  'Lat',
  'Lng',
  'Info',
  'Link',
  'Plan entry',
  'Entry type',
  'Date',
  'Time',
  'Created by',
]

const deHeaders = [
  'Titel',
  'Kategorie',
  'Adresse',
  'Breite',
  'Länge',
  'Info',
  'Link',
  'Planeintrag',
  'Eintragstyp',
  'Datum',
  'Uhrzeit',
  'Erstellt von',
]

const honshu = {
  name: 'Honshu',
  timezone: 'Asia/Tokyo',
  region: {
    bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 },
  },
}

describe('export', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig

  beforeAll(async () => {
    db = await createTestDatabase()
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
    })
    app = await buildApp(db.pool, {
      config,
      now: () => new Date(exportedOn),
    })
  })

  afterAll(async () => {
    await app.close()
    await db.pool.end()
    await db.drop()
  })

  beforeEach(async () => {
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
      DELETE FROM sessions;
      DELETE FROM users;
    `)
  })

  it('T-14-01 seed CSV has an English header, a BOM, and one row per visit or unplanned spot', async () => {
    await seedDatabase(db.pool)
    const owner = await login('100000000000000001')
    const response = await exportFile(owner.cookie, seedTrip, 'csv')
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="japan-2026-2026-06-01.csv"',
    )
    const raw = response.rawPayload
    expect([raw[0], raw[1], raw[2]]).toEqual([0xef, 0xbb, 0xbf])
    const rows = parseCsv(response)
    expect(Object.keys(rows[0] ?? {})).toEqual(enHeaders)
    const counts = await db.pool.query<{ visits: number; unplanned: number }>(
      `
      SELECT
        (SELECT count(*)::int FROM plan_entry_spots WHERE trip_id = $1) AS visits,
        (
          SELECT count(*)::int FROM spots s
          WHERE s.trip_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM plan_entry_spots p WHERE p.spot_id = s.id
            )
        ) AS unplanned
      `,
      [seedTrip],
    )
    const expected =
      Number(counts.rows[0]?.visits) + Number(counts.rows[0]?.unplanned)
    expect(rows).toHaveLength(expected)
    const logged = await db.pool.query<{ metadata: { format: string } }>(
      `SELECT metadata FROM activity_events WHERE action = 'export.download'`,
    )
    expect(logged.rows).toHaveLength(1)
    expect(logged.rows[0]?.metadata).toMatchObject({
      trip: 'Japan 2026',
      format: 'csv',
    })
  })

  it('T-14-02 a German profile gets German headers and category labels', async () => {
    const user = await login('100000000000000142')
    const locale = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: jsonHeaders(user.cookie),
      payload: { locale: 'de' },
    })
    expect(locale.statusCode).toBe(200)
    const tripId = await createTrip(user.cookie)
    await postSpot(user.cookie, tripId, {
      title: 'Cafe',
      lat: 35.68,
      lng: 139.76,
      baseCategory: 'must_go',
    })
    const response = await exportFile(user.cookie, tripId, 'csv')
    expect(response.statusCode).toBe(200)
    const rows = parseCsv(response)
    expect(Object.keys(rows[0] ?? {})).toEqual(deHeaders)
    expect(rows[0]?.Kategorie).toBe('Muss hin')
  })

  it('T-14-03 prefixes a formula-like title', async () => {
    const owner = await login('100000000000000143')
    const tripId = await createTrip(owner.cookie)
    await postSpot(owner.cookie, tripId, {
      title: '=HYPERLINK("x")',
      lat: 35.68,
      lng: 139.76,
      baseCategory: 'maybe',
    })
    const rows = parseCsv(await exportFile(owner.cookie, tripId, 'csv'))
    expect(rows[0]?.Title).toBe(`'=HYPERLINK("x")`)
  })

  it('T-14-04 CSV rows follow the filtered list order', async () => {
    const owner = await login('100000000000000144')
    const tripId = await createTrip(owner.cookie)
    await postSpot(owner.cookie, tripId, spot('Zulu', 'must_go'))
    await postSpot(owner.cookie, tripId, spot('Middle', 'maybe'))
    await postSpot(owner.cookie, tripId, spot('Alpha', 'must_go'))
    const planned = await postSpot(
      owner.cookie,
      tripId,
      spot('Planned Cafe', 'must_go'),
    )
    const entry = await app.inject({
      method: 'POST',
      url: `/trips/${tripId}/plan`,
      headers: jsonHeaders(owner.cookie),
      payload: {
        type: 'bucket',
        title: 'Days',
        startDate: '2026-04-12',
        endDate: '2026-04-16',
      },
    })
    expect(entry.statusCode).toBe(201)
    const linked = await app.inject({
      method: 'POST',
      url: `/plan/${entry.json().id}/spots`,
      headers: jsonHeaders(owner.cookie),
      payload: { spotId: planned.json().id },
    })
    expect(linked.statusCode).toBe(201)

    const listed = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}/spots?cat=must_go`,
      headers: { cookie: owner.cookie },
    })
    const exported = await exportFile(
      owner.cookie,
      tripId,
      'csv',
      'cat=must_go',
    )
    expect(exported.statusCode).toBe(200)
    const titles = parseCsv(exported).map((row) => row.Title)
    expect(titles).toEqual(
      listed.json().spots.map((item: { title: string }) => item.title),
    )
    // The planned spot keeps its Must go kind, so the kind filter still lists it.
    expect(titles).toEqual(['Planned Cafe', 'Alpha', 'Zulu'])
  })

  it('T-14-05 ICS keeps Fuji at 04:30 local time and stable UIDs', async () => {
    await seedDatabase(db.pool)
    const owner = await login('100000000000000001')
    const created = await app.inject({
      method: 'POST',
      url: `/trips/${seedTrip}/plan`,
      headers: jsonHeaders(owner.cookie),
      payload: {
        type: 'single',
        title: 'Fuji',
        date: '2026-04-16',
        startTime: '04:30',
      },
    })
    expect(created.statusCode).toBe(201)
    const first = await exportFile(owner.cookie, seedTrip, 'ics')
    const second = await exportFile(owner.cookie, seedTrip, 'ics')
    expect(first.statusCode).toBe(200)
    expect(first.headers['content-disposition']).toBe(
      'attachment; filename="japan-2026-2026-06-01.ics"',
    )
    const ics = first.rawPayload.toString('utf8')
    expect(ics).toContain('TZID=Asia/Tokyo:20260416T043000')
    const parsed = calendarEvents(ics)
    const fuji = parsed.find((event) => event.summary === 'Fuji')
    expect(fuji).toBeTruthy()
    expect(fuji?.startDate.hour).toBe(4)
    expect(fuji?.startDate.minute).toBe(30)
    expect(fuji?.startDate.zone.tzid).toBe('Asia/Tokyo')
    const tokyo = parsed.find((event) => event.summary === 'Tokyo')
    expect(tokyo?.startDate.isDate).toBe(true)
    expect(uids(ics)).toEqual(uids(second.rawPayload.toString('utf8')))
    expect(new Set(uids(ics)).size).toBe(uids(ics).length)
  })

  it('T-14-06 PDF includes the trip title, Tokyo, and an unscheduled spot', async () => {
    await seedDatabase(db.pool)
    const owner = await login('100000000000000001')
    const response = await exportFile(owner.cookie, seedTrip, 'pdf')
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('application/pdf')
    const pdf = await getDocumentProxy(new Uint8Array(response.rawPayload))
    const extracted = await extractText(pdf, { mergePages: true })
    expect(extracted.totalPages).toBeGreaterThanOrEqual(1)
    expect(extracted.text).toContain('Japan 2026')
    expect(extracted.text).toContain('Tokyo')
    expect(extracted.text).toContain('Nara Park')
  })

  it('T-14-07 hides the export from non-members and allows visitors', async () => {
    await seedDatabase(db.pool)
    const outsider = await login('100000000000000147')
    const missing = await exportFile(outsider.cookie, seedTrip, 'csv')
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'not_found' })

    const visitor = await login('100000000000000003')
    const allowed = await exportFile(visitor.cookie, seedTrip, 'csv')
    expect(allowed.statusCode).toBe(200)
    expect(allowed.headers['content-disposition']).toContain('japan-2026-')
  })

  it('T-14-08 exports 500 spots in under 3 seconds', async () => {
    const owner = await login('100000000000000148')
    const tripId = await createTrip(owner.cookie)
    const maybe = await presetKind(tripId, 'maybe')
    await db.pool.query(
      `
      WITH s AS (
        INSERT INTO spots (trip_id, title, lat, lng, base_category, created_by)
        SELECT $1, 'Spot ' || i, 35.5, 139.5, 'kind', $2
        FROM generate_series(1, 500) AS i
        RETURNING id, trip_id
      )
      INSERT INTO spot_kind_links (trip_id, spot_id, kind_id)
      SELECT trip_id, id, $3 FROM s
      `,
      [tripId, owner.user.id, maybe],
    )
    const started = performance.now()
    const response = await exportFile(owner.cookie, tripId, 'csv')
    const elapsed = performance.now() - started
    expect(response.statusCode).toBe(200)
    expect(parseCsv(response)).toHaveLength(500)
    expect(elapsed).toBeLessThan(3000)
  })

  it('T-28-17 CSV shows kind names, joined for two, and the preset label in the language', async () => {
    const owner = await login('100000000000000171')
    const tripId = await createTrip(owner.cookie)
    const { food, mustGo } = await foodFirst(tripId)
    await kindSpot(tripId, owner.user.id, 'Ramen', [food])
    await kindSpot(tripId, owner.user.id, 'Both', [food, mustGo])
    await kindSpot(tripId, owner.user.id, 'Plain', [mustGo])
    await homeSpot(tripId, owner.user.id, 'Hotel')

    const en = parseCsv(await exportFile(owner.cookie, tripId, 'csv'))
    const category = (rows: Record<string, string>[], title: string) =>
      rows.find((row) => row.Title === title)?.Category ??
      rows.find((row) => row.Titel === title)?.Kategorie
    expect(category(en, 'Ramen')).toBe('Food')
    expect(category(en, 'Both')).toBe('Food / Must go')
    expect(category(en, 'Plain')).toBe('Must go')
    expect(category(en, 'Hotel')).toBe('Home')

    const patched = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: jsonHeaders(owner.cookie),
      payload: { locale: 'de' },
    })
    expect(patched.statusCode).toBe(200)
    const de = parseCsv(await exportFile(owner.cookie, tripId, 'csv'))
    expect(category(de, 'Ramen')).toBe('Food')
    expect(category(de, 'Both')).toBe('Food / Muss hin')
    expect(category(de, 'Plain')).toBe('Muss hin')
    expect(category(de, 'Hotel')).toBe('Unterkunft')
  })

  it('T-28-17 PDF groups unscheduled spots by primary kind in kind order, then home', async () => {
    const owner = await login('100000000000000172')
    const tripId = await createTrip(owner.cookie)
    const { food, mustGo } = await foodFirst(tripId)
    const maybe = await presetKind(tripId, 'maybe')
    await kindSpot(tripId, owner.user.id, 'Spot Maybe', [maybe])
    await kindSpot(tripId, owner.user.id, 'Spot Must', [mustGo])
    await kindSpot(tripId, owner.user.id, 'Spot Both', [mustGo, food])
    await kindSpot(tripId, owner.user.id, 'Spot Food', [food])
    await homeSpot(tripId, owner.user.id, 'Spot Hotel')
    const response = await exportFile(owner.cookie, tripId, 'pdf')
    expect(response.statusCode).toBe(200)
    const pdf = await getDocumentProxy(new Uint8Array(response.rawPayload))
    const { text } = await extractText(pdf, { mergePages: true })
    const at = (needle: string) => text.indexOf(needle)
    const order = [
      'Food',
      'Spot Both',
      'Spot Food',
      'Must go',
      'Maybe',
      'Spot Maybe',
      'Home',
      'Spot Hotel',
    ].map(at)
    expect(order.every((index) => index >= 0)).toBe(true)
    // Food heading holds the spot whose primary kind is Food; "Spot Both" has
    // Food first in kind order, so it is listed there and not under Must go.
    expect(at('Spot Food')).toBeLessThan(at('Must go'))
    expect(at('Spot Both')).toBeLessThan(at('Must go'))
    expect(at('Spot Must')).toBeGreaterThan(at('Must go'))
    expect(at('Must go')).toBeLessThan(at('Maybe'))
    expect(at('Maybe')).toBeLessThan(at('Spot Maybe'))
    expect(at('Spot Maybe')).toBeLessThan(at('Home'))
    expect(at('Home')).toBeLessThan(at('Spot Hotel'))
  })

  it('rejects anonymous callers and invalid export queries', async () => {
    const anon = await app.inject({
      method: 'GET',
      url: `/trips/${seedTrip}/export?format=csv`,
    })
    expect(anon.statusCode).toBe(401)

    const owner = await login('100000000000000149')
    const tripId = await createTrip(owner.cookie)
    const format = await exportFile(owner.cookie, tripId, 'gpx')
    expect(format.statusCode).toBe(400)
    expect(format.json()).toEqual({
      error: 'invalid_request',
      fields: { format: 'invalid' },
    })
    const sort = await exportFile(owner.cookie, tripId, 'csv', 'sort=rank')
    expect(sort.statusCode).toBe(400)
    expect(sort.json()).toMatchObject({
      error: 'invalid_request',
      fields: { sort: 'invalid' },
    })
    const id = await app.inject({
      method: 'GET',
      url: '/trips/not-a-uuid/export?format=csv',
      headers: { cookie: owner.cookie },
    })
    expect(id.statusCode).toBe(400)
  })

  async function presetKind(
    tripId: string,
    preset: 'must_go' | 'maybe',
  ): Promise<string> {
    const color = preset === 'must_go' ? '#E5484D' : '#30A46C'
    const symbol = preset === 'must_go' ? 'exclamation' : 'question'
    const order = preset === 'must_go' ? 1 : 2
    await db.pool.query(
      `
      INSERT INTO spot_kinds (trip_id, preset, color, symbol, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
      `,
      [tripId, preset, color, symbol, order],
    )
    const result = await db.pool.query<{ id: string }>(
      'SELECT id FROM spot_kinds WHERE trip_id = $1 AND preset = $2',
      [tripId, preset],
    )
    return result.rows[0]!.id
  }

  /** Adds Food as the first kind, ahead of the two presets. */
  async function foodFirst(tripId: string) {
    const mustGo = await presetKind(tripId, 'must_go')
    const maybe = await presetKind(tripId, 'maybe')
    await db.pool.query(
      'UPDATE spot_kinds SET sort_order = CASE id WHEN $1 THEN 1 ELSE 2 END WHERE id IN ($1, $2)',
      [mustGo, maybe],
    )
    const food = await db.pool.query<{ id: string }>(
      `
      INSERT INTO spot_kinds (trip_id, name, color, symbol, sort_order)
      VALUES ($1, 'Food', '#D9480F', 'food', 0)
      RETURNING id
      `,
      [tripId],
    )
    return { food: food.rows[0]!.id, mustGo, maybe }
  }

  async function kindSpot(
    tripId: string,
    userId: string,
    title: string,
    kindIds: string[],
  ) {
    await db.pool.query(
      `
      WITH s AS (
        INSERT INTO spots (trip_id, title, lat, lng, base_category, created_by)
        VALUES ($1, $3, 35.68, 139.76, 'kind', $2)
        RETURNING id, trip_id
      )
      INSERT INTO spot_kind_links (trip_id, spot_id, kind_id)
      SELECT s.trip_id, s.id, k FROM s, unnest($4::uuid[]) AS k
      `,
      [tripId, userId, title, kindIds],
    )
  }

  async function homeSpot(tripId: string, userId: string, title: string) {
    await db.pool.query(
      `
      INSERT INTO spots (trip_id, title, lat, lng, base_category, created_by)
      VALUES ($1, $3, 35.68, 139.76, 'home', $2)
      `,
      [tripId, userId, title],
    )
  }

  async function login(discordId: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId },
    })
    expect(response.statusCode).toBe(200)
    return {
      cookie: sessionHeader(response),
      user: response.json() as { id: string; username: string },
    }
  }

  async function createTrip(cookie: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: jsonHeaders(cookie),
      payload: honshu,
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  function postSpot(cookie: string, tripId: string, payload: object) {
    return app.inject({
      method: 'POST',
      url: `/trips/${tripId}/spots`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function exportFile(
    cookie: string,
    tripId: string,
    format: string,
    search = '',
  ) {
    const extra = search.length > 0 ? `&${search}` : ''
    return app.inject({
      method: 'GET',
      url: `/trips/${tripId}/export?format=${format}${extra}`,
      headers: { cookie },
    })
  }
})

function spot(title: string, baseCategory: string) {
  return { title, lat: 35.68, lng: 139.76, baseCategory }
}

function parseCsv(response: LightMyRequestResponse): Record<string, string>[] {
  return parse(response.rawPayload, {
    columns: true,
    bom: true,
  }) as Record<string, string>[]
}

function calendarEvents(ics: string) {
  const component = new ICAL.Component(ICAL.parse(ics))
  return component
    .getAllSubcomponents('vevent')
    .map((item) => new ICAL.Event(item))
}

function uids(ics: string): string[] {
  return calendarEvents(ics)
    .map((event) => event.uid)
    .sort()
}

function jsonHeaders(cookie: string) {
  return {
    cookie,
    origin: WEB_ORIGIN,
    'content-type': 'application/json',
  }
}

function sessionHeader(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie']
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : []
  const cookie = cookies.find((value) => value.startsWith('tb_session=')) ?? ''
  const pair = cookie.split(';')[0] ?? ''
  return `tb_session=${pair.slice(pair.indexOf('=') + 1)}`
}
