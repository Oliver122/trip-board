import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadConfig, type AppConfig } from '../config.js'
import { seedDatabase, seedIds } from '../db/seed.js'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import { CommentLimiter } from './limit.js'

const WEB_ORIGIN = 'http://127.0.0.1:5180'
const { sven, aiko, tom } = seedIds.users
const { fushimi, shibuya } = seedIds.spots
const seedTrip = seedIds.trip

describe('spot comments', () => {
  let db: TestDatabase
  let app: FastifyInstance
  let config: AppConfig
  let clock: Date

  beforeAll(async () => {
    db = await createTestDatabase()
    await seedDatabase(db.pool)
    config = loadConfig({
      DATABASE_URL: db.url,
      NODE_ENV: 'test',
      WEB_ORIGIN,
    })
    clock = new Date()
    app = await buildApp(db.pool, { config, now: () => clock })
  })

  afterAll(async () => {
    await app.close()
    await db.pool.end()
    await db.drop()
  })

  beforeEach(async () => {
    await db.pool.query(`
      DELETE FROM spot_comments;
      DELETE FROM spot_comment_reads;
      DELETE FROM activity_events WHERE action LIKE 'comment.%';
    `)
  })

  // ── helpers ────────────────────────────────────────────────────────────

  async function login(discordId: string, on: FastifyInstance = app) {
    const response = await on.inject({
      method: 'POST',
      url: '/test/login',
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { discordId },
    })
    expect(response.statusCode).toBe(200)
    const raw = response.headers['set-cookie']
    const cookies = Array.isArray(raw) ? raw : [raw ?? '']
    const session = cookies.find((value) => value.startsWith('tb_session='))
    return `tb_session=${(session ?? '').split(';')[0]!.slice('tb_session='.length)}`
  }

  const svenCookie = () => login('100000000000000001')
  const aikoCookie = () => login('100000000000000002')
  const tomCookie = () => login('100000000000000003')

  function jsonHeaders(cookie: string) {
    return {
      cookie,
      origin: WEB_ORIGIN,
      'content-type': 'application/json',
    }
  }

  function post(cookie: string, spotId: string, body: unknown) {
    return app.inject({
      method: 'POST',
      url: `/spots/${spotId}/comments`,
      headers: jsonHeaders(cookie),
      payload: { body },
    })
  }

  function list(cookie: string, spotId: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/spots/${spotId}/comments${query}`,
      headers: { cookie },
    })
  }

  function patch(cookie: string, commentId: string, body: unknown) {
    return app.inject({
      method: 'PATCH',
      url: `/comments/${commentId}`,
      headers: jsonHeaders(cookie),
      payload: { body },
    })
  }

  function remove(cookie: string, commentId: string) {
    return app.inject({
      method: 'DELETE',
      url: `/comments/${commentId}`,
      headers: { cookie, origin: WEB_ORIGIN },
    })
  }

  function markRead(cookie: string, spotId: string, upTo: string) {
    return app.inject({
      method: 'PUT',
      url: `/spots/${spotId}/comments/read`,
      headers: jsonHeaders(cookie),
      payload: { upTo },
    })
  }

  async function spotCounts(cookie: string, spotId: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/spots/${spotId}`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    const spot = response.json()
    return {
      commentCount: spot.commentCount as number,
      unreadComments: spot.unreadComments as number,
    }
  }

  /** Inserts comments at millisecond offsets, like the API's own timestamps. */
  async function addComments(
    spotId: string,
    authorId: string,
    count: number,
    offset = 0,
  ) {
    for (let index = offset; index < offset + count; index += 1) {
      await db.pool.query(
        `INSERT INTO spot_comments (trip_id, spot_id, author_id, body, created_at)
         VALUES ($1, $2, $3, $4,
                 date_trunc('milliseconds', clock_timestamp()) + $5::int * interval '1 millisecond')`,
        [seedTrip, spotId, authorId, `comment ${index}`, index],
      )
    }
  }

  // ── T-24-03 ───────────────────────────────────────────────────────────

  it('T-24-03 lets a visitor post and pages the thread oldest first', async () => {
    const tomSession = await tomCookie()
    const created = await post(tomSession, fushimi, 'Early morning?')
    expect(created.statusCode).toBe(201)
    const row = await db.pool.query<{ author_id: string }>(
      'SELECT author_id FROM spot_comments WHERE id = $1',
      [created.json().id],
    )
    expect(row.rows[0]?.author_id).toBe(tom)

    await db.pool.query('DELETE FROM spot_comments')
    await addComments(fushimi, aiko, 60)
    const svenSession = await svenCookie()
    const first = await list(svenSession, fushimi)
    expect(first.statusCode).toBe(200)
    const page1 = first.json()
    expect(page1.comments).toHaveLength(50)
    expect(page1.comments[0].body).toBe('comment 0')
    expect(page1.nextCursor).toEqual(expect.any(String))
    const second = await list(
      svenSession,
      fushimi,
      `?cursor=${encodeURIComponent(page1.nextCursor)}`,
    )
    expect(second.json().comments).toHaveLength(10)
    expect(second.json().nextCursor).toBeNull()
  })

  it('T-24-03 sets canEdit only on own comments and canDelete on all for the owner', async () => {
    await addComments(fushimi, aiko, 1)
    await addComments(fushimi, tom, 1, 1)
    const svenSession = await svenCookie()
    const comments = (await list(svenSession, fushimi)).json().comments
    const aikoComment = comments.find(
      (comment: { body: string }) => comment.body === 'comment 0',
    )
    expect(aikoComment.author.displayName).toBe('Aiko')
    expect(aikoComment.canEdit).toBe(false)
    expect(aikoComment.canDelete).toBe(true)

    const aikoSession = await aikoCookie()
    const aikoView = (await list(aikoSession, fushimi)).json().comments
    expect(
      aikoView.map((comment: { canEdit: boolean }) => comment.canEdit),
    ).toEqual([true, false])
  })

  // ── T-24-04 ───────────────────────────────────────────────────────────

  it('T-24-04 rejects empty and 2001-character bodies with 400', async () => {
    const session = await aikoCookie()
    expect((await post(session, fushimi, '')).statusCode).toBe(400)
    expect((await post(session, fushimi, '   ')).statusCode).toBe(400)
    expect((await post(session, fushimi, 'x'.repeat(2001))).statusCode).toBe(
      400,
    )
  })

  it('T-24-04 rejects a bad cursor with 400', async () => {
    const session = await aikoCookie()
    const response = await list(session, fushimi, '?cursor=garbage')
    expect(response.statusCode).toBe(400)
  })

  it('T-24-04 returns 401 without a session and 404 for a non-member or unknown spot', async () => {
    expect((await list('', fushimi)).statusCode).toBe(401)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/spots/${fushimi}/comments`,
          headers: jsonHeaders(''),
          payload: { body: 'hi' },
        })
      ).statusCode,
    ).toBe(401)

    const outsider = await login('100000000000000777')
    expect((await list(outsider, fushimi)).statusCode).toBe(404)
    expect((await post(outsider, fushimi, 'hi')).statusCode).toBe(404)

    const unknown = '20000000-0000-0000-0000-00000000ffff'
    const session = await aikoCookie()
    expect((await list(session, unknown)).statusCode).toBe(404)
    expect((await post(session, unknown, 'hi')).statusCode).toBe(404)
  })

  // ── T-24-05 ───────────────────────────────────────────────────────────

  it('T-24-05 edits own comments, refuses edits by others, and deletes by role', async () => {
    const aikoSession = await aikoCookie()
    const svenSession = await svenCookie()
    const tomSession = await tomCookie()
    const created = await post(aikoSession, fushimi, 'Go early')
    const commentId = created.json().id as string

    const edited = await patch(aikoSession, commentId, 'Go very early')
    expect(edited.statusCode).toBe(200)
    expect(edited.json().editedAt).not.toBeNull()
    const row = await db.pool.query<{ edited_at: Date | null }>(
      'SELECT edited_at FROM spot_comments WHERE id = $1',
      [commentId],
    )
    expect(row.rows[0]?.edited_at).not.toBeNull()

    expect((await patch(svenSession, commentId, 'mine now')).statusCode).toBe(
      403,
    )
    expect((await remove(tomSession, commentId)).statusCode).toBe(403)
    expect((await remove(svenSession, commentId)).statusCode).toBe(204)

    const second = (await post(aikoSession, fushimi, 'again')).json().id
    expect((await remove(aikoSession, second)).statusCode).toBe(204)

    const outsider = await login('100000000000000777')
    expect((await patch(outsider, second, 'x')).statusCode).toBe(404)
    expect((await remove(outsider, second)).statusCode).toBe(404)
    const unknown = '30000000-0000-0000-0000-00000000ffff'
    expect((await patch(aikoSession, unknown, 'x')).statusCode).toBe(404)
    expect((await remove(aikoSession, unknown)).statusCode).toBe(404)
    expect((await patch(aikoSession, commentId, '')).statusCode).toBe(400)
    expect((await patch('', commentId, 'x')).statusCode).toBe(401)
  })

  // ── T-24-06 ───────────────────────────────────────────────────────────

  it('T-24-06 keeps comments of removed members and shows former members as null', async () => {
    const quinnSession = await login('100000000000000555')
    const quinn = (
      await db.pool.query<{ id: string }>(
        `SELECT id FROM users WHERE discord_id = '100000000000000555'`,
      )
    ).rows[0]!.id
    await db.pool.query(
      `UPDATE users SET display_name = 'Quinn' WHERE id = $1`,
      [quinn],
    )
    await db.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'visitor')`,
      [seedTrip, quinn],
    )
    const svenSession = await svenCookie()
    await post(quinnSession, fushimi, 'Stays visible')
    await db.pool.query(
      'DELETE FROM trip_members WHERE trip_id = $1 AND user_id = $2',
      [seedTrip, quinn],
    )
    expect((await list(quinnSession, fushimi)).statusCode).toBe(404)
    const seen = (await list(svenSession, fushimi)).json().comments
    expect(seen).toHaveLength(1)
    expect(seen[0].author.displayName).toBe('Quinn')

    await db.pool.query('DELETE FROM users WHERE id = $1', [quinn])
    const afterDelete = (await list(svenSession, fushimi)).json().comments
    expect(afterDelete[0].author).toBeNull()
  })

  // ── T-24-07 ───────────────────────────────────────────────────────────

  it('T-24-07 reports commentCount on spot lists and details', async () => {
    await addComments(fushimi, aiko, 2)
    const session = await svenCookie()
    const detail = await app.inject({
      method: 'GET',
      url: `/spots/${fushimi}`,
      headers: { cookie: session },
    })
    expect(detail.json().commentCount).toBe(2)
    const spots = await app.inject({
      method: 'GET',
      url: `/trips/${seedTrip}/spots`,
      headers: { cookie: session },
    })
    const byId = new Map(
      spots.json().spots.map((spot: { id: string }) => [spot.id, spot]),
    )
    expect((byId.get(fushimi) as { commentCount: number }).commentCount).toBe(2)
    expect((byId.get(shibuya) as { commentCount: number }).commentCount).toBe(0)
  })

  // ── T-24-08 ───────────────────────────────────────────────────────────

  it('T-24-08 records one activity row per write and no comment text', async () => {
    const aikoSession = await aikoCookie()
    const svenSession = await svenCookie()
    const created = await post(aikoSession, fushimi, 'Secret text 123')
    const commentId = created.json().id as string
    await patch(aikoSession, commentId, 'Edited secret 456')
    await remove(svenSession, commentId)

    const rows = await db.pool.query<{
      action: string
      metadata: Record<string, unknown>
      entity_id: string
    }>(
      `SELECT action, metadata, entity_id FROM activity_events
       WHERE action LIKE 'comment.%' ORDER BY id`,
    )
    expect(rows.rows.map((row) => row.action)).toEqual([
      'comment.create',
      'comment.update',
      'comment.delete',
    ])
    for (const row of rows.rows) {
      expect(row.metadata).toMatchObject({
        trip: 'Japan 2026',
        spot: 'Fushimi Inari',
      })
      expect(JSON.stringify(row.metadata)).not.toContain('secret')
      expect(row.entity_id).toBe(fushimi)
    }
    expect(rows.rows[2]?.metadata.author).toBe('Aiko')
  })

  it('T-24-08 adds no activity row for a failed validation', async () => {
    const session = await aikoCookie()
    await post(session, fushimi, '')
    const rows = await db.pool.query(
      `SELECT 1 FROM activity_events WHERE action = 'comment.create'`,
    )
    expect(rows.rowCount).toBe(0)
  })

  // ── T-24-19, T-24-20, T-24-22 ─────────────────────────────────────────

  it('T-24-20 counts unread comments for each reader and not their own', async () => {
    const svenSession = await svenCookie()
    const aikoSession = await aikoCookie()
    const tomSession = await tomCookie()
    expect(await spotCounts(svenSession, fushimi)).toEqual({
      commentCount: 0,
      unreadComments: 0,
    })
    // Sven reads the empty spot first.
    await markRead(svenSession, fushimi, new Date(clock).toISOString())

    await post(aikoSession, fushimi, 'one')
    await post(aikoSession, fushimi, 'two')
    await post(tomSession, fushimi, 'three')

    expect(await spotCounts(svenSession, fushimi)).toEqual({
      commentCount: 3,
      unreadComments: 3,
    })
    expect((await spotCounts(aikoSession, fushimi)).unreadComments).toBe(1)

    const trips = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { cookie: svenSession },
    })
    const trip = trips
      .json()
      .trips.find((item: { id: string }) => item.id === seedTrip)
    expect(trip.unreadComments).toBe(3)

    const comments = (await list(svenSession, fushimi)).json().comments
    expect(
      (await patch(aikoSession, comments[0].id, 'edited one')).statusCode,
    ).toBe(200)
    expect((await spotCounts(svenSession, fushimi)).unreadComments).toBe(3)
  })

  it('T-24-19 does not count comments from before the member joined', async () => {
    await addComments(fushimi, aiko, 2)
    await db.pool.query(
      `UPDATE trip_members SET joined_at = now() + interval '1 hour'
       WHERE trip_id = $1 AND user_id = $2`,
      [seedTrip, tom],
    )
    const tomSession = await tomCookie()
    expect((await spotCounts(tomSession, fushimi)).unreadComments).toBe(0)
    await db.pool.query(
      `UPDATE trip_members SET joined_at = now() - interval '1 hour'
       WHERE trip_id = $1 AND user_id = $2`,
      [seedTrip, tom],
    )
    expect((await spotCounts(tomSession, fushimi)).unreadComments).toBe(2)
  })

  it('T-24-22 moves last_read_at forward only, validates upTo and returns 204', async () => {
    const aikoSession = await aikoCookie()
    const svenSession = await svenCookie()
    await post(aikoSession, fushimi, 'first')
    const newest = (await list(svenSession, fushimi)).json().comments[0]
      .createdAt as string
    expect((await markRead(svenSession, fushimi, newest)).statusCode).toBe(204)
    expect((await spotCounts(svenSession, fushimi)).unreadComments).toBe(0)

    // An older upTo must not move the mark backwards.
    const before = await db.pool.query<{ last_read_at: Date }>(
      `SELECT last_read_at FROM spot_comment_reads WHERE user_id = $1 AND spot_id = $2`,
      [sven, fushimi],
    )
    await markRead(svenSession, fushimi, '2020-01-01T00:00:00.000Z')
    const after = await db.pool.query<{ last_read_at: Date }>(
      `SELECT last_read_at FROM spot_comment_reads WHERE user_id = $1 AND spot_id = $2`,
      [sven, fushimi],
    )
    expect(after.rows[0]?.last_read_at).toEqual(before.rows[0]?.last_read_at)

    // A comment posted after upTo stays unread.
    await post(aikoSession, fushimi, 'second')
    expect((await spotCounts(svenSession, fushimi)).unreadComments).toBe(1)

    // A future upTo is stored as now.
    const future = '2999-01-01T00:00:00.000Z'
    expect((await markRead(svenSession, fushimi, future)).statusCode).toBe(204)
    const stored = await db.pool.query<{ last_read_at: Date }>(
      `SELECT last_read_at FROM spot_comment_reads WHERE user_id = $1 AND spot_id = $2`,
      [sven, fushimi],
    )
    expect(stored.rows[0]!.last_read_at.getFullYear()).toBeLessThan(2100)
    expect((await markRead(svenSession, fushimi, 'x')).statusCode).toBe(400)
    expect((await markRead('', fushimi, newest)).statusCode).toBe(401)
    const outsider = await login('100000000000000777')
    expect((await markRead(outsider, fushimi, newest)).statusCode).toBe(404)
  })

  it('T-24-22 clears every spot with POST news/read and writes no activity row', async () => {
    const aikoSession = await aikoCookie()
    const svenSession = await svenCookie()
    await post(aikoSession, fushimi, 'a')
    await post(aikoSession, shibuya, 'b')
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/trips/${seedTrip}/news`,
          headers: { cookie: svenSession },
        })
      ).json().total,
    ).toBe(2)

    const cleared = await app.inject({
      method: 'POST',
      url: `/trips/${seedTrip}/news/read`,
      headers: { cookie: svenSession, origin: WEB_ORIGIN },
    })
    expect(cleared.statusCode).toBe(204)
    const news = await app.inject({
      method: 'GET',
      url: `/trips/${seedTrip}/news`,
      headers: { cookie: svenSession },
    })
    expect(news.json()).toEqual({ entries: [], total: 0 })
    const outsider = await login('100000000000000777')
    const denied = await app.inject({
      method: 'POST',
      url: `/trips/${seedTrip}/news/read`,
      headers: { cookie: outsider, origin: WEB_ORIGIN },
    })
    expect(denied.statusCode).toBe(404)
    const anonymous = await app.inject({
      method: 'POST',
      url: `/trips/${seedTrip}/news/read`,
      headers: { origin: WEB_ORIGIN },
    })
    expect(anonymous.statusCode).toBe(401)
    const events = await db.pool.query(
      `SELECT 1 FROM activity_events WHERE action = 'comment.read'`,
    )
    expect(events.rowCount).toBe(0)
  })

  // ── T-24-21 ───────────────────────────────────────────────────────────

  it('T-24-21 lists unread spots newest first with counts, excerpts and total', async () => {
    const aikoSession = await aikoCookie()
    const svenSession = await svenCookie()
    await post(
      aikoSession,
      fushimi,
      'Early morning is best, you know. '.repeat(10),
    )
    await post(aikoSession, shibuya, 'Shibuya at night')
    await post(aikoSession, seedIds.spots.nara, 'Nara deer')

    const response = await app.inject({
      method: 'GET',
      url: `/trips/${seedTrip}/news`,
      headers: { cookie: svenSession },
    })
    expect(response.statusCode).toBe(200)
    const news = response.json()
    expect(news.total).toBe(3)
    expect(news.entries.map((entry: { id: string }) => entry.id)).toEqual([
      seedIds.spots.nara,
      shibuya,
      fushimi,
    ])
    const fushimiEntry = news.entries[2]
    expect(fushimiEntry.unreadComments).toBe(1)
    expect(fushimiEntry.author.displayName).toBe('Aiko')
    expect(fushimiEntry.excerpt).toHaveLength(140)
    expect(fushimiEntry.displayCategory).toBe('planned')

    const outsider = await login('100000000000000777')
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/trips/${seedTrip}/news`,
          headers: { cookie: outsider },
        })
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/trips/20000000-0000-0000-0000-00000000ffff/news`,
          headers: { cookie: svenSession },
        })
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/trips/${seedTrip}/news`,
        })
      ).statusCode,
    ).toBe(401)
  })

  // ── T-24-11 ───────────────────────────────────────────────────────────

  // T-24-10
  it('T-24-11 answers the 21st comment in a minute with 429 and Retry-After', async () => {
    const limitedClock = new Date('2026-06-01T10:00:00.000Z')
    const limitedApp = await buildApp(db.pool, {
      config,
      now: () => limitedClock,
    })
    try {
      const session = await login('100000000000000002', limitedApp)
      for (let index = 0; index < 20; index += 1) {
        const response = await limitedApp.inject({
          method: 'POST',
          url: `/spots/${fushimi}/comments`,
          headers: jsonHeaders(session),
          payload: { body: `n${index}` },
        })
        expect(response.statusCode).toBe(201)
      }
      const blocked = await limitedApp.inject({
        method: 'POST',
        url: `/spots/${fushimi}/comments`,
        headers: jsonHeaders(session),
        payload: { body: 'too many' },
      })
      expect(blocked.statusCode).toBe(429)
      expect(blocked.headers['retry-after']).toBe('60')

      limitedClock.setTime(limitedClock.getTime() + 61_000)
      const next = await limitedApp.inject({
        method: 'POST',
        url: `/spots/${fushimi}/comments`,
        headers: jsonHeaders(session),
        payload: { body: 'after the minute' },
      })
      expect(next.statusCode).toBe(201)
    } finally {
      await limitedApp.close()
    }
  })

  it('T-24-11 limiter allows 20 per minute per user', () => {
    const limiter = new CommentLimiter()
    const at = new Date('2026-06-01T10:00:00.000Z')
    for (let index = 0; index < 20; index += 1) {
      expect(limiter.check('user', at)).toEqual({ ok: true })
    }
    expect(limiter.check('user', at)).toEqual({ ok: false, retryAfter: 60 })
    expect(limiter.check('other', at)).toEqual({ ok: true })
  })
})
