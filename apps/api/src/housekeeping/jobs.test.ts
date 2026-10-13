import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../db/test-db.js'
import type { ObjectStorage } from '../images/storage.js'
import { drainBlobDeletions } from '../images/worker.js'
import {
  deleteExpiredSessions,
  deleteOldActivity,
  deleteOldInvites,
  deleteStaleCommons,
  deleteStaleGeocode,
} from './jobs.js'

const hasDb = Boolean(process.env.DATABASE_URL)
const now = new Date('2026-06-01T00:00:00.000Z')
const userId = '00000000-0000-0000-0000-000000000099'
const tripId = '10000000-0000-0000-0000-000000000099'

describe.skipIf(!hasDb)('housekeeping', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase()
    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `
        INSERT INTO users (id, discord_id, username)
        VALUES ($1, '100000000000000099', 'house')
        `,
        [userId],
      )
      await client.query(
        `
        INSERT INTO trips (
          id, name, timezone, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat, created_by
        )
        VALUES ($1, 'Housekeeping', 'UTC', 0, 0, 1, 1, $2)
        `,
        [tripId, userId],
      )
      await client.query(
        `
        INSERT INTO trip_members (trip_id, user_id, role)
        VALUES ($1, $2, 'owner')
        `,
        [tripId, userId],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    await db.pool.query(
      `
      INSERT INTO sessions (id, user_id, created_at, expires_at)
      VALUES
        ($1, $3, '2026-05-01T00:00:00Z', '2026-05-31T00:00:00Z'),
        ($2, $3, '2026-05-20T00:00:00Z', '2026-06-20T00:00:00Z')
      `,
      ['a'.repeat(64), 'b'.repeat(64), userId],
    )
    await db.pool.query(
      `
      INSERT INTO trip_invites (trip_id, code, role, created_at, expires_at, revoked_at)
      VALUES
        ($1, 'OLD-AAAA', 'visitor', '2026-02-01T00:00:00Z', '2026-02-08T00:00:00Z', NULL),
        ($1, 'REV-CCCC', 'visitor', '2026-02-01T00:00:00Z', '2026-02-08T00:00:00Z', '2026-02-20T00:00:00Z'),
        ($1, 'NEW-BBBB', 'visitor', '2026-05-28T00:00:00Z', '2026-06-03T00:00:00Z', NULL),
        ($1, 'RNT-DDDD', 'visitor', '2026-05-20T00:00:00Z', '2026-05-27T00:00:00Z', '2026-05-25T00:00:00Z')
      `,
      [tripId],
    )
    await db.pool.query(
      `
      INSERT INTO geocode_cache (query_key, response, created_at)
      VALUES
        ('old', '{"results":[]}'::jsonb, '2026-04-01T00:00:00Z'),
        ('new', '{"results":[]}'::jsonb, '2026-05-20T00:00:00Z')
      `,
    )
    await db.pool.query(
      `
      INSERT INTO commons_cache (point_key, response, created_at)
      VALUES
        ('old', '{"suggestions":[]}'::jsonb, '2026-05-20T00:00:00Z'),
        ('new', '{"suggestions":[]}'::jsonb, '2026-05-28T00:00:00Z')
      `,
    )
    await db.pool.query(
      `
      INSERT INTO activity_events (action, created_at)
      VALUES
        ('spot.create', '2025-11-01T00:00:00Z'),
        ('spot.update', '2026-05-01T00:00:00Z')
      `,
    )
    await db.pool.query(
      `
      INSERT INTO blob_deletions (storage_key, attempts, enqueued_at)
      VALUES
        ('ready', 0, $1),
        ('waiting', 2, $1),
        ('due', 2, $1::timestamptz - interval '3 minutes')
      `,
      [now],
    )
  }, 60_000)

  afterAll(async () => {
    await db?.pool.end()
    await db?.drop()
  })

  it('T-15-05 deletes only rows past each retention window', async () => {
    expect(await deleteExpiredSessions(db.pool, now)).toBe(1)
    expect(await deleteOldInvites(db.pool, now)).toBe(2)
    expect(await deleteStaleGeocode(db.pool, now)).toBe(1)
    expect(await deleteStaleCommons(db.pool, now)).toBe(1) // T-34-06
    expect(await deleteOldActivity(db.pool, now)).toBe(1)

    const sessions = await db.pool.query('SELECT id FROM sessions ORDER BY id')
    expect(sessions.rows.map((row) => row.id)).toEqual(['b'.repeat(64)])

    const invites = await db.pool.query(
      'SELECT code FROM trip_invites ORDER BY code',
    )
    expect(invites.rows.map((row) => row.code)).toEqual([
      'NEW-BBBB',
      'RNT-DDDD',
    ])

    const geocode = await db.pool.query(
      'SELECT query_key FROM geocode_cache ORDER BY query_key',
    )
    expect(geocode.rows.map((row) => row.query_key)).toEqual(['new'])

    const commons = await db.pool.query(
      'SELECT point_key FROM commons_cache ORDER BY point_key',
    )
    expect(commons.rows.map((row) => row.point_key)).toEqual(['new'])

    const activity = await db.pool.query(
      'SELECT action FROM activity_events ORDER BY action',
    )
    expect(activity.rows.map((row) => row.action)).toEqual(['spot.update'])

    const deleted: string[] = []
    const storage = {
      async delete(key: string) {
        deleted.push(key)
      },
    } as ObjectStorage
    expect(await drainBlobDeletions(db.pool, storage, now)).toBe(2)
    expect(deleted.sort()).toEqual(['due', 'ready'])
    const blobs = await db.pool.query(
      'SELECT storage_key FROM blob_deletions ORDER BY storage_key',
    )
    expect(blobs.rows.map((row) => row.storage_key)).toEqual(['waiting'])
  })
})
