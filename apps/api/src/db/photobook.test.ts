import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedDatabase } from './seed.js'
import { createTestDatabase, type TestDatabase } from './test-db.js'

const hasDb = Boolean(process.env.DATABASE_URL)

const tripId = '10000000-0000-0000-0000-000000000001'
const spotId = '20000000-0000-0000-0000-000000000001'

describe.skipIf(!hasDb)('photobook images', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase()
    await seedDatabase(db.pool)
    // Start without the seed photos; each test adds its own.
    await db.pool.query('DELETE FROM images')
    await db.pool.query('DELETE FROM blob_deletions')
  }, 60_000)

  afterAll(async () => {
    await db?.pool.end()
    await db?.drop()
  })

  async function insert(
    key: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const values = {
      trip_id: tripId,
      storage_key: key,
      bytes: 1000,
      width: 640,
      height: 480,
      ...extra,
    }
    const columns = Object.keys(values)
    await db.pool.query(
      `INSERT INTO images (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(values),
    )
  }

  // T-47-01
  it('T-47-01 rejects half a point and a long caption, accepts a null spot', async () => {
    await expect(insert('a.webp', { lat: 35.6 })).rejects.toMatchObject({
      constraint: 'images_point_check',
    })
    await expect(insert('b.webp', { lng: 139.7 })).rejects.toMatchObject({
      constraint: 'images_point_check',
    })
    await expect(
      insert('c.webp', { caption: 'x'.repeat(501) }),
    ).rejects.toMatchObject({ constraint: 'images_caption_check' })
    await expect(insert('d.webp', { place_source: 'guess' })).rejects.toThrow()
    await expect(insert('e.webp', { spot_id: null })).resolves.toBeUndefined()
    await db.pool.query('DELETE FROM images')
    await db.pool.query('DELETE FROM blob_deletions')
  })

  // T-47-01
  it('T-47-01 deleting a spot removes its pointless image and keeps its photo with a point', async () => {
    await insert('gallery.webp', { spot_id: spotId })
    await insert('photo.webp', {
      spot_id: spotId,
      lat: 35.6582,
      lng: 139.7022,
      place_source: 'exif',
      taken_at: '2026-04-13 10:15:00',
    })
    await db.pool.query('DELETE FROM spots WHERE id = $1', [spotId])

    const images = await db.pool.query<{
      storage_key: string
      spot_id: string | null
    }>('SELECT storage_key, spot_id FROM images')
    expect(images.rows).toEqual([{ storage_key: 'photo.webp', spot_id: null }])
    const queued = await db.pool.query<{ storage_key: string }>(
      'SELECT storage_key FROM blob_deletions',
    )
    expect(queued.rows).toEqual([{ storage_key: 'gallery.webp' }])
  })

  // T-47-01
  it('T-47-01 deleting the trip removes both and queues all blobs', async () => {
    await insert('free.webp')
    await db.pool.query('DELETE FROM trips WHERE id = $1', [tripId])
    expect((await db.pool.query('SELECT 1 FROM images')).rowCount).toBe(0)
    const queued = await db.pool.query<{ storage_key: string }>(
      'SELECT storage_key FROM blob_deletions ORDER BY storage_key',
    )
    expect(queued.rows.map((row) => row.storage_key)).toEqual([
      'free.webp',
      'gallery.webp',
      'photo.webp',
    ])
  })
})
