import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig } from '../config.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'

const honshu = {
  name: 'Honshu',
  timezone: 'Asia/Tokyo',
  region: {
    bbox: { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 },
  },
}

const tokyo = { title: 'Tokyo Station', lat: 35.6812, lng: 139.7671 }

type Kind = {
  id: string
  name: string | null
  preset: string | null
  color: string
  symbol: string
  sortOrder: number
  spotCount: number
}

describe('spot kinds', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let base: string

  beforeAll(async () => {
    db = await createTestDatabase()
    const config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
    })
    app = await buildApp(db.pool, {
      config,
      now: () => new Date('2026-06-01T00:00:00.000Z'),
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (!address || typeof address === 'string') throw new Error('no port')
    base = `http://127.0.0.1:${address.port}`
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

  it('T-28-06 an admin creates, edits and reorders kinds', async () => {
    const { admin, tripId } = await setup('2801')
    const created = await postKind(admin.cookie, tripId, {
      name: ' Food ',
      color: '#d9480f',
      symbol: 'food',
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      name: 'Food',
      preset: null,
      color: '#D9480F',
      symbol: 'food',
      sortOrder: 2,
      spotCount: 0,
    })
    const food = created.json() as Kind

    const plain = await postKind(admin.cookie, tripId, {
      name: 'Sights',
      color: '#0F766E',
    })
    expect(plain.statusCode).toBe(201)
    expect(plain.json().symbol).toBe('dot')
    expect(plain.json().sortOrder).toBe(3)

    const renamed = await patchKind(admin.cookie, tripId, food.id, {
      name: 'Eating',
      color: '#A21CAF',
      symbol: 'coffee',
    })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json()).toMatchObject({
      name: 'Eating',
      color: '#A21CAF',
      symbol: 'coffee',
    })

    const [mustGo, maybe] = (await kinds(admin.cookie, tripId)).slice(0, 2)
    const renamedPreset = await patchKind(admin.cookie, tripId, mustGo?.id, {
      name: 'Top',
    })
    expect(renamedPreset.json()).toMatchObject({
      name: 'Top',
      preset: 'must_go',
    })

    const ids = [food.id, mustGo?.id, maybe?.id, plain.json().id]
    const order = await putOrder(admin.cookie, tripId, ids)
    expect(order.statusCode).toBe(200)
    expect(order.json().kinds.map((kind: Kind) => kind.id)).toEqual(ids)
    expect(
      (await kinds(admin.cookie, tripId)).map((kind) => kind.sortOrder),
    ).toEqual([0, 1, 2, 3])

    const pizza = await patchKind(admin.cookie, tripId, food.id, {
      symbol: 'pizza',
    })
    expect(pizza.statusCode).toBe(400)
    expect(pizza.json().error).toBe('kind_symbol_unknown')
    const unknownSymbol = await postKind(admin.cookie, tripId, {
      name: 'Pizza',
      color: '#D9480F',
      symbol: 'pizza',
    })
    expect(unknownSymbol.statusCode).toBe(400)
    expect(unknownSymbol.json().error).toBe('kind_symbol_unknown')
    expect((await kinds(admin.cookie, tripId)).map((k) => k.symbol)).toEqual([
      'coffee',
      'exclamation',
      'question',
      'dot',
    ])

    const duplicate = await postKind(admin.cookie, tripId, {
      name: 'eating',
      color: '#D9480F',
    })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().error).toBe('kind_name_taken')
    const clash = await patchKind(admin.cookie, tripId, plain.json().id, {
      name: ' EATING ',
    })
    expect(clash.statusCode).toBe(409)
    expect(clash.json().error).toBe('kind_name_taken')

    for (const bad of [
      ids.slice(1),
      [...ids, ids[0]],
      [ids[0], ids[0], ids[1], ids[2]],
    ]) {
      const response = await putOrder(admin.cookie, tripId, bad)
      expect(response.statusCode).toBe(400)
    }

    for (let index = 4; index < 12; index += 1) {
      const filler = await postKind(admin.cookie, tripId, {
        name: `Kind ${index}`,
        color: '#57534E',
      })
      expect(filler.statusCode).toBe(201)
    }
    const thirteenth = await postKind(admin.cookie, tripId, {
      name: 'One too many',
      color: '#57534E',
    })
    expect(thirteenth.statusCode).toBe(409)
    expect(thirteenth.json().error).toBe('kind_limit')
  })

  it('T-28-06 role matrix: 401, 403, 404 and visitor reads', async () => {
    const { admin, planner, visitor, outsider, tripId } = await setup('2802')
    const other = await createTrip(outsider.cookie)
    const otherKind = (await kinds(outsider.cookie, other))[0] as Kind
    const mine = (await kinds(admin.cookie, tripId))[0] as Kind
    const ids = (await kinds(admin.cookie, tripId)).map((kind) => kind.id)
    const body = { name: 'Food', color: '#D9480F' }

    const bare = (
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url: string,
    ) => app.inject({ method, url, headers: { origin: WEB_ORIGIN } })
    expect((await bare('GET', `/trips/${tripId}/kinds`)).statusCode).toBe(401)
    expect((await bare('POST', `/trips/${tripId}/kinds`)).statusCode).toBe(401)
    expect((await bare('PUT', `/trips/${tripId}/kinds/order`)).statusCode).toBe(
      401,
    )
    expect(
      (await bare('PATCH', `/trips/${tripId}/kinds/${mine.id}`)).statusCode,
    ).toBe(401)
    expect(
      (await bare('DELETE', `/trips/${tripId}/kinds/${mine.id}`)).statusCode,
    ).toBe(401)

    for (const member of [planner, visitor]) {
      expect((await kindsResponse(member.cookie, tripId)).statusCode).toBe(200)
      expect((await postKind(member.cookie, tripId, body)).statusCode).toBe(403)
      expect((await putOrder(member.cookie, tripId, ids)).statusCode).toBe(403)
      expect(
        (await patchKind(member.cookie, tripId, mine.id, { name: 'X' }))
          .statusCode,
      ).toBe(403)
      expect(
        (await deleteKind(member.cookie, tripId, mine.id, ids[1])).statusCode,
      ).toBe(403)
    }

    expect((await kindsResponse(outsider.cookie, tripId)).statusCode).toBe(404)
    expect((await postKind(outsider.cookie, tripId, body)).statusCode).toBe(404)

    // The kind of another trip is a 404 even for an admin of this trip.
    expect(
      (await patchKind(admin.cookie, tripId, otherKind.id, { name: 'X' }))
        .statusCode,
    ).toBe(404)
    expect(
      (await deleteKind(admin.cookie, tripId, otherKind.id, ids[1])).statusCode,
    ).toBe(404)
    expect(
      (await putOrder(admin.cookie, tripId, [otherKind.id, ...ids.slice(1)]))
        .statusCode,
    ).toBe(400)
    expect(
      (await patchKind(admin.cookie, tripId, 'not-a-uuid', { name: 'X' }))
        .statusCode,
    ).toBe(400)
    expect(
      (await patchKind(admin.cookie, tripId, mine.id, {})).statusCode,
    ).toBe(400)
    expect(
      (await postKind(admin.cookie, tripId, { color: '#D9480F' })).statusCode,
    ).toBe(400)
  })

  it('T-28-09 rejects low contrast, reserved and malformed colors', async () => {
    const { admin, tripId } = await setup('2803')
    const low = await postKind(admin.cookie, tripId, {
      name: 'Pale',
      color: '#FFE066',
    })
    expect(low.statusCode).toBe(400)
    expect(low.json().error).toBe('kind_color_contrast')
    const reserved = await postKind(admin.cookie, tripId, {
      name: 'Blue',
      color: '#3e63dd',
    })
    expect(reserved.statusCode).toBe(400)
    expect(reserved.json().error).toBe('kind_color_reserved')
    const home = await patchKind(
      admin.cookie,
      tripId,
      ((await kinds(admin.cookie, tripId))[0] as Kind).id,
      { color: '#f5a524' },
    )
    expect(home.statusCode).toBe(400)
    expect(home.json().error).toBe('kind_color_reserved')
    const malformed = await postKind(admin.cookie, tripId, {
      name: 'Red',
      color: 'red',
    })
    expect(malformed.statusCode).toBe(400)
    expect(malformed.json().error).toBe('invalid_request')
    expect(await kinds(admin.cookie, tripId)).toHaveLength(2)
  })

  it('T-28-07 deleting a kind moves its spots in one transaction', async () => {
    const { admin, tripId } = await setup('2804')
    const [mustGo, maybe] = (await kinds(admin.cookie, tripId)) as [Kind, Kind]
    const food = (
      await postKind(admin.cookie, tripId, { name: 'Food', color: '#D9480F' })
    ).json() as Kind
    const a = await spot(admin.cookie, tripId, 'A', [food.id])
    const b = await spot(admin.cookie, tripId, 'B', [food.id, mustGo.id])
    const c = await spot(admin.cookie, tripId, 'C', [food.id, maybe.id])
    await spot(admin.cookie, tripId, 'D', [maybe.id])
    expect((await kinds(admin.cookie, tripId))[2]?.spotCount).toBe(3)

    const missing = await deleteKind(admin.cookie, tripId, food.id)
    expect(missing.statusCode).toBe(400)
    expect(missing.json().error).toBe('kind_move_required')
    const same = await deleteKind(admin.cookie, tripId, food.id, food.id)
    expect(same.statusCode).toBe(400)
    expect(same.json().error).toBe('kind_move_same')
    const stranger = await login('280499')
    const otherTrip = await createTrip(stranger.cookie)
    const foreign = (await kinds(stranger.cookie, otherTrip))[0] as Kind
    expect(
      (await deleteKind(admin.cookie, tripId, food.id, foreign.id)).statusCode,
    ).toBe(404)

    // A failing move rolls everything back: the kind and its links stay.
    await db.pool.query(`
      CREATE FUNCTION fail_move() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'boom'; END $$;
      CREATE TRIGGER fail_move BEFORE INSERT ON spot_kind_links
        FOR EACH ROW EXECUTE FUNCTION fail_move();
    `)
    try {
      const failed = await deleteKind(admin.cookie, tripId, food.id, maybe.id)
      expect(failed.statusCode).toBe(500)
    } finally {
      await db.pool.query(
        'DROP TRIGGER fail_move ON spot_kind_links; DROP FUNCTION fail_move()',
      )
    }
    expect((await kinds(admin.cookie, tripId))[2]?.spotCount).toBe(3)

    const deleted = await deleteKind(admin.cookie, tripId, food.id, maybe.id)
    expect(deleted.statusCode).toBe(204)
    const after = await kinds(admin.cookie, tripId)
    expect(after.map((kind) => kind.preset)).toEqual(['must_go', 'maybe'])
    expect(after.map((kind) => kind.spotCount)).toEqual([1, 4])
    expect(await kindNames(admin.cookie, a)).toEqual(['maybe'])
    expect(await kindNames(admin.cookie, b)).toEqual(['must_go', 'maybe'])
    expect(await kindNames(admin.cookie, c)).toEqual(['maybe'])

    const event = await db.pool.query(
      `SELECT metadata FROM activity_events WHERE action = 'kind.delete'`,
    )
    expect(event.rows).toHaveLength(1)
    expect(event.rows[0]?.metadata).toEqual({
      name: 'Food',
      movedTo: 'Maybe',
      moved: 3,
    })

    const unused = (
      await postKind(admin.cookie, tripId, { name: 'Unused', color: '#57534E' })
    ).json() as Kind
    expect((await deleteKind(admin.cookie, tripId, unused.id)).statusCode).toBe(
      204,
    )

    expect(
      (await deleteKind(admin.cookie, tripId, mustGo.id, maybe.id)).statusCode,
    ).toBe(204)
    const last = await deleteKind(admin.cookie, tripId, maybe.id)
    expect(last.statusCode).toBe(409)
    expect(last.json().error).toBe('kind_last')
  })

  it('T-28-10 every kind write is one event and one live message', async () => {
    const { admin, planner, tripId } = await setup('2805')
    const stream = await fetch(`${base}/trips/${tripId}/events`, {
      headers: { cookie: planner.cookie },
    })
    expect(stream.status).toBe(200)
    const live = collect(stream)

    const created = (
      await postKind(admin.cookie, tripId, { name: 'Food', color: '#D9480F' })
    ).json() as Kind
    await patchKind(admin.cookie, tripId, created.id, { name: 'Eats' })
    const all = await kinds(admin.cookie, tripId)
    await putOrder(admin.cookie, tripId, [
      created.id,
      ...all.filter((k) => k.id !== created.id).map((k) => k.id),
    ])
    await deleteKind(admin.cookie, tripId, created.id)

    const rows = await db.pool.query<{
      action: string
      metadata: Record<string, unknown>
    }>(
      `SELECT action, metadata FROM activity_events WHERE action LIKE 'kind.%' ORDER BY id`,
    )
    expect(rows.rows.map((row) => row.action)).toEqual([
      'kind.create',
      'kind.update',
      'kind.reorder',
      'kind.delete',
    ])
    expect(rows.rows[0]?.metadata).toEqual({ name: 'Food' })
    expect(rows.rows[1]?.metadata).toEqual({ name: 'Eats' })
    expect(rows.rows[2]?.metadata).toEqual({ count: 3 })
    expect(rows.rows[3]?.metadata).toEqual({
      name: 'Eats',
      movedTo: null,
      moved: 0,
    })

    const text = await live.wait(
      (body) => body.split('"resource":"kind"').length - 1 >= 4,
    )
    expect(text.split('"resource":"kind"').length - 1).toBe(4)
    for (const action of ['create', 'update', 'reorder', 'delete']) {
      expect(text).toContain(`"action":"kind.${action}"`)
    }
    await live.cancel()
  })

  it('T-28-11 spots take one or two kinds of their own trip', async () => {
    const { admin, tripId } = await setup('2806')
    const [mustGo, maybe] = (await kinds(admin.cookie, tripId)) as [Kind, Kind]
    const food = (
      await postKind(admin.cookie, tripId, { name: 'Food', color: '#D9480F' })
    ).json() as Kind

    const one = await postSpot(admin.cookie, tripId, {
      ...tokyo,
      kindIds: [food.id],
    })
    expect(one.statusCode).toBe(201)
    expect(one.json()).toMatchObject({
      baseCategory: 'kind',
      displayCategory: 'kind',
      kinds: [{ id: food.id, name: 'Food', symbol: 'dot' }],
    })

    // Kinds are listed in trip order whatever order was sent.
    const two = await postSpot(admin.cookie, tripId, {
      ...tokyo,
      title: 'Two',
      kindIds: [food.id, mustGo.id],
    })
    expect(two.statusCode).toBe(201)
    expect(two.json().kinds.map((kind: Kind) => kind.id)).toEqual([
      mustGo.id,
      food.id,
    ])

    for (const kindIds of [
      [],
      [food.id, mustGo.id, maybe.id],
      [food.id, food.id],
    ]) {
      const bad = await postSpot(admin.cookie, tripId, { ...tokyo, kindIds })
      expect(bad.statusCode).toBe(400)
      expect(bad.json().fields.kindIds).toBeTruthy()
    }
    const stranger = await login('280699')
    const otherTrip = await createTrip(stranger.cookie)
    const foreign = (await kinds(stranger.cookie, otherTrip))[0] as Kind
    const crossed = await postSpot(admin.cookie, tripId, {
      ...tokyo,
      kindIds: [foreign.id],
    })
    expect(crossed.statusCode).toBe(400)
    expect(crossed.json().fields.kindIds).toBe('invalid')
    const crossedPatch = await patchSpot(admin.cookie, one.json().id, {
      kindIds: [mustGo.id, foreign.id],
    })
    expect(crossedPatch.statusCode).toBe(400)
    const missing = await postSpot(admin.cookie, tripId, tokyo)
    expect(missing.statusCode).toBe(400)

    const legacy = await postSpot(admin.cookie, tripId, {
      ...tokyo,
      title: 'Legacy',
      category: 'maybe',
    })
    expect(legacy.statusCode).toBe(201)
    expect(legacy.json().kinds).toMatchObject([{ id: maybe.id }])

    // A planned spot keeps its kinds.
    await db.pool.query(`
      INSERT INTO plan_entries (trip_id, type, title, start_date, created_by)
      SELECT trip_id, 'single', 'Dinner', '2026-04-12', created_by
      FROM spots WHERE id = '${two.json().id}';
    `)
    await db.pool.query(
      `
      INSERT INTO plan_entry_spots (trip_id, plan_entry_id, spot_id, sort_order)
      SELECT $1, (SELECT id FROM plan_entries WHERE trip_id = $1), $2, 0
      `,
      [tripId, two.json().id],
    )
    const planned = await getSpot(admin.cookie, two.json().id)
    expect(planned.displayCategory).toBe('planned')
    expect(planned.kinds).toHaveLength(2)

    // Home removes both links; going back needs kinds again.
    const home = await patchSpot(admin.cookie, two.json().id, {
      category: 'home',
    })
    expect(home.statusCode).toBe(200)
    expect(home.json()).toMatchObject({ baseCategory: 'home', kinds: [] })
    const links = await db.pool.query(
      'SELECT 1 FROM spot_kind_links WHERE spot_id = $1',
      [two.json().id],
    )
    expect(links.rows).toHaveLength(0)
    const back = await patchSpot(admin.cookie, two.json().id, {
      kindIds: [maybe.id],
    })
    expect(back.json()).toMatchObject({ baseCategory: 'kind' })

    // Deleting the preset kind makes the legacy name fail.
    await deleteKind(admin.cookie, tripId, maybe.id, mustGo.id)
    const gone = await postSpot(admin.cookie, tripId, {
      ...tokyo,
      category: 'maybe',
    })
    expect(gone.statusCode).toBe(400)
    expect(gone.json().error).toBe('kind_not_found')
  })

  it('filters and sorts by kind, and drops legacy names of deleted kinds', async () => {
    const { admin, tripId } = await setup('2807')
    const [mustGo, maybe] = (await kinds(admin.cookie, tripId)) as [Kind, Kind]
    const food = (
      await postKind(admin.cookie, tripId, { name: 'Food', color: '#D9480F' })
    ).json() as Kind
    await spot(admin.cookie, tripId, 'M', [maybe.id])
    await spot(admin.cookie, tripId, 'F', [food.id, maybe.id])
    await spot(admin.cookie, tripId, 'G', [mustGo.id])
    await postSpot(admin.cookie, tripId, {
      ...tokyo,
      title: 'H',
      category: 'home',
    })

    const titlesOf = async (query: string) =>
      (
        (
          await app.inject({
            method: 'GET',
            url: `/trips/${tripId}/spots?${query}`,
            headers: { cookie: admin.cookie },
          })
        ).json().spots as { title: string }[]
      ).map((entry) => entry.title)

    expect(await titlesOf(`cat=${food.id}`)).toEqual(['F'])
    expect(await titlesOf(`cat=${maybe.id}`)).toEqual(['F', 'M'])
    expect(await titlesOf('cat=must_go')).toEqual(['G'])
    expect(await titlesOf('cat=home')).toEqual(['H'])
    expect(await titlesOf('sort=category')).toEqual(['G', 'F', 'M', 'H'])
    expect(await titlesOf('')).toEqual(['G', 'F', 'M', 'H'])

    await deleteKind(admin.cookie, tripId, mustGo.id, maybe.id)
    expect(await titlesOf('cat=must_go')).toEqual(['F', 'G', 'M', 'H'])
  })

  async function setup(prefix: string) {
    const admin = await login(`${prefix}01`)
    const tripId = await createTrip(admin.cookie)
    const planner = await login(`${prefix}02`)
    const visitor = await login(`${prefix}03`)
    const outsider = await login(`${prefix}04`)
    await addMember(tripId, planner.user.id, 'planner')
    await addMember(tripId, visitor.user.id, 'visitor')
    return { admin, planner, visitor, outsider, tripId }
  }

  async function login(discordId: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId: discordId.padEnd(18, '0') },
    })
    expect(response.statusCode).toBe(200)
    return {
      cookie: sessionHeader(response),
      user: response.json() as { id: string },
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

  async function addMember(tripId: string, userId: string, role: string) {
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, $3)`,
      [tripId, userId, role],
    )
  }

  function kindsResponse(cookie: string, tripId: string) {
    return app.inject({
      method: 'GET',
      url: `/trips/${tripId}/kinds`,
      headers: { cookie },
    })
  }

  async function kinds(cookie: string, tripId: string): Promise<Kind[]> {
    const response = await kindsResponse(cookie, tripId)
    expect(response.statusCode).toBe(200)
    return response.json().kinds as Kind[]
  }

  function postKind(cookie: string, tripId: string, payload: object) {
    return app.inject({
      method: 'POST',
      url: `/trips/${tripId}/kinds`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function patchKind(
    cookie: string,
    tripId: string,
    kindId: string | undefined,
    payload: object,
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}/kinds/${kindId}`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function putOrder(
    cookie: string,
    tripId: string,
    ids: (string | undefined)[],
  ) {
    return app.inject({
      method: 'PUT',
      url: `/trips/${tripId}/kinds/order`,
      headers: jsonHeaders(cookie),
      payload: { ids },
    })
  }

  function deleteKind(
    cookie: string,
    tripId: string,
    kindId: string,
    moveTo?: string,
  ) {
    return app.inject({
      method: 'DELETE',
      url: `/trips/${tripId}/kinds/${kindId}${moveTo ? `?moveTo=${moveTo}` : ''}`,
      headers: writeHeaders(cookie),
    })
  }

  function postSpot(cookie: string, tripId: string, payload: object) {
    return app.inject({
      method: 'POST',
      url: `/trips/${tripId}/spots`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  function patchSpot(cookie: string, spotId: string, payload: object) {
    return app.inject({
      method: 'PATCH',
      url: `/spots/${spotId}`,
      headers: jsonHeaders(cookie),
      payload,
    })
  }

  async function spot(
    cookie: string,
    tripId: string,
    title: string,
    kindIds: string[],
  ): Promise<string> {
    const response = await postSpot(cookie, tripId, {
      ...tokyo,
      title,
      kindIds,
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  async function getSpot(cookie: string, spotId: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/spots/${spotId}`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    return response.json()
  }

  /** Presets of a spot's kinds, null for a custom kind. */
  async function kindNames(cookie: string, spotId: string) {
    const body = await getSpot(cookie, spotId)
    return (body.kinds as Kind[]).map((kind) => kind.preset)
  }
})

function collect(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('no body')
  const decoder = new TextDecoder()
  let text = ''
  let stopped = false
  void (async () => {
    while (!stopped) {
      const chunk = await reader.read().catch(() => ({ done: true as const }))
      if (chunk.done) return
      text += decoder.decode(chunk.value, { stream: true })
    }
  })()
  return {
    wait(done: (body: string) => boolean) {
      return new Promise<string>((resolve, reject) => {
        const started = Date.now()
        const timer = setInterval(() => {
          if (done(text)) {
            clearInterval(timer)
            resolve(text)
          } else if (Date.now() - started > 5000) {
            clearInterval(timer)
            reject(new Error(`no live events: ${text}`))
          }
        }, 15)
      })
    },
    async cancel() {
      stopped = true
      await reader.cancel().catch(() => undefined)
    },
  }
}

function writeHeaders(cookie: string) {
  return { cookie, origin: WEB_ORIGIN }
}

function jsonHeaders(cookie: string) {
  return { ...writeHeaders(cookie), 'content-type': 'application/json' }
}

function sessionHeader(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie']
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : []
  const cookie = cookies.find((value) => value.startsWith('tb_session=')) ?? ''
  const pair = cookie.split(';')[0] ?? ''
  return `tb_session=${pair.slice(pair.indexOf('=') + 1)}`
}
