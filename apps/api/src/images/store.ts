import { randomUUID } from 'node:crypto'
import type { Quota } from '@tripboard/shared'
import type { Pool, PoolClient } from 'pg'
import { activity } from '../activity/record.js'
import { withTransaction } from '../db/transaction.js'
import { requireTripRole } from '../trips/roles.js'
import type { ProcessedImage } from './process.js'
import { signImagePath } from './sign.js'
import type { ObjectStorage } from './storage.js'

export type ImageRecord = {
  id: string
  tripId: string
  spotId: string
  url: string
  bytes: number
  width: number
  height: number
  sortOrder: number
  createdAt: string
  sourceUrl: string | null
  credit: string | null
  license: string | null
}

type ImageRow = {
  id: string
  trip_id: string
  spot_id: string
  bytes: number
  width: number
  height: number
  sort_order: number
  created_at: Date
  source_url: string | null
  credit: string | null
  license: string | null
}

const imageColumns =
  'id, trip_id, spot_id, bytes, width, height, sort_order, created_at, source_url, credit, license'

/** Where a photo came from, for URL and Commons photos (R-34-05, R-34-06). */
export type ImageSource = {
  kind: 'url' | 'commons'
  url: string | null
  credit: string | null
  license: string | null
}

export class QuotaExceeded extends Error {
  constructor(readonly quota: Quota) {
    super('quota')
  }
}

class AlreadyAdded extends Error {}

/** Planner access to a spot, checked before anything is downloaded. */
export async function planSpotAccess(
  db: Pool,
  spotId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
  const spot = await spotTrip(db, spotId)
  if (!spot) return { ok: false, status: 404 }
  const access = await requireTripRole(db, spot.tripId, userId, 'planner')
  return access.ok ? { ok: true } : access
}

export async function hasSourceImage(
  db: Pool,
  spotId: string,
  sourceUrl: string,
): Promise<boolean> {
  const result = await db.query(
    'SELECT 1 FROM images WHERE spot_id = $1 AND source_url = $2',
    [spotId, sourceUrl],
  )
  return (result.rowCount ?? 0) > 0
}

export async function uploadsEnabled(db: Pool | PoolClient): Promise<boolean> {
  const result = await db.query<{ uploads_enabled: boolean }>(
    'SELECT uploads_enabled FROM app_settings',
  )
  return result.rows[0]?.uploads_enabled ?? true
}

export async function readQuota(
  db: Pool | PoolClient,
  userId: string,
): Promise<Quota | null> {
  const result = await db.query<{
    used_images: number
    max_images: number
    used_bytes: string | number
    max_bytes: string | number
  }>(
    `
    SELECT used_images, max_images, used_bytes, max_bytes
    FROM user_quota_usage
    WHERE user_id = $1
    `,
    [userId],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    usedImages: Number(row.used_images),
    maxImages: Number(row.max_images),
    usedBytes: Number(row.used_bytes),
    maxBytes: Number(row.max_bytes),
  }
}

export async function listImages(
  pool: Pool,
  spotId: string,
  userId: string,
  secret: string,
  now: Date,
): Promise<
  | { ok: true; images: ImageRecord[]; uploadsEnabled: boolean }
  | { ok: false; status: 403 | 404 }
> {
  const spot = await spotTrip(pool, spotId)
  if (!spot) return { ok: false, status: 404 }
  const access = await requireTripRole(pool, spot.tripId, userId, 'visitor')
  if (!access.ok) return access
  const rows = await pool.query<ImageRow>(
    `
    SELECT ${imageColumns}
    FROM images
    WHERE spot_id = $1
    ORDER BY sort_order, created_at, id
    `,
    [spotId],
  )
  return {
    ok: true,
    images: rows.rows.map((row) => toImage(row, secret, now)),
    uploadsEnabled: await uploadsEnabled(pool),
  }
}

export async function getImage(
  pool: Pool,
  imageId: string,
  userId: string,
  secret: string,
  now: Date,
): Promise<
  { ok: true; image: ImageRecord } | { ok: false; status: 403 | 404 }
> {
  const row = await pool.query<ImageRow>(
    `
    SELECT ${imageColumns}
    FROM images
    WHERE id = $1
    `,
    [imageId],
  )
  const image = row.rows[0]
  if (!image) return { ok: false, status: 404 }
  const access = await requireTripRole(pool, image.trip_id, userId, 'visitor')
  if (!access.ok) return access
  return { ok: true, image: toImage(image, secret, now) }
}

export async function readImageBytes(
  pool: Pool,
  storage: ObjectStorage,
  imageId: string,
): Promise<Buffer | null> {
  const row = await pool.query<{ storage_key: string }>(
    'SELECT storage_key FROM images WHERE id = $1',
    [imageId],
  )
  const key = row.rows[0]?.storage_key
  if (!key) return null
  return storage.get(key)
}

export async function storeImage(
  pool: Pool,
  storage: ObjectStorage,
  input: {
    userId: string
    spotId: string
    image: ProcessedImage
    secret: string
    now: Date
    beforeInsert?: () => Promise<void>
    source?: ImageSource
  },
): Promise<
  | { ok: true; image: ImageRecord }
  | { ok: false; status: 403 | 404 | 409 | 413; quota?: Quota }
> {
  const spot = await spotTrip(pool, input.spotId)
  if (!spot) return { ok: false, status: 404 }
  const access = await requireTripRole(
    pool,
    spot.tripId,
    input.userId,
    'planner',
  )
  if (!access.ok) return access

  const key = `trips/${spot.tripId}/spots/${spot.id}/${randomUUID()}.webp`
  let uploaded = false
  try {
    const image = await withTransaction(pool, async (tx) => {
      await tx.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
        input.userId,
      ])
      const quota = await readQuota(tx, input.userId)
      if (!quota) return { missing: true as const }
      const allowed =
        quota.usedImages + 1 <= quota.maxImages &&
        quota.usedBytes + input.image.data.length <= quota.maxBytes
      if (!allowed) throw new QuotaExceeded(quota)

      // The same Commons file twice on one spot (R-34-09).
      if (input.source?.kind === 'commons' && input.source.url) {
        const same = await tx.query(
          'SELECT 1 FROM images WHERE spot_id = $1 AND source_url = $2',
          [spot.id, input.source.url],
        )
        if ((same.rowCount ?? 0) > 0) throw new AlreadyAdded()
      }

      await storage.put(key, input.image.data)
      uploaded = true
      if (input.beforeInsert) await input.beforeInsert()

      const inserted = await tx.query<ImageRow>(
        `
        INSERT INTO images (
          trip_id, spot_id, uploaded_by, storage_key, bytes, width, height, sort_order,
          source_url, credit, license
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          COALESCE((SELECT max(sort_order) + 1 FROM images WHERE spot_id = $2), 0),
          $8, $9, $10
        )
        RETURNING ${imageColumns}
        `,
        [
          spot.tripId,
          spot.id,
          input.userId,
          key,
          input.image.data.length,
          input.image.width,
          input.image.height,
          input.source?.url ?? null,
          input.source?.credit ?? null,
          input.source?.license ?? null,
        ],
      )
      const row = inserted.rows[0]
      if (!row) throw new Error('insert failed')
      await activity.record(tx, {
        actor: input.userId,
        trip: spot.tripId,
        action: 'image.upload',
        entityId: row.id,
        metadata: {
          spot: spot.title,
          bytes: row.bytes,
          ...(input.source ? { source: input.source.kind } : {}),
        },
      })
      return { missing: false as const, row }
    })
    if (image.missing) return { ok: false, status: 404 }
    return { ok: true, image: toImage(image.row, input.secret, input.now) }
  } catch (error) {
    if (uploaded) {
      await storage.delete(key).catch(() => undefined)
    }
    if (error instanceof QuotaExceeded) {
      return { ok: false, status: 413, quota: error.quota }
    }
    if (error instanceof AlreadyAdded) return { ok: false, status: 409 }
    if (isForeignKey(error)) return { ok: false, status: 404 }
    throw error
  }
}

export async function removeImage(
  pool: Pool,
  imageId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
  const existing = await pool.query<{ trip_id: string; title: string }>(
    `
    SELECT i.trip_id, s.title
    FROM images i
    JOIN spots s ON s.id = i.spot_id
    WHERE i.id = $1
    `,
    [imageId],
  )
  const image = existing.rows[0]
  if (!image) return { ok: false, status: 404 }
  const access = await requireTripRole(pool, image.trip_id, userId, 'planner')
  if (!access.ok) return access

  return withTransaction(pool, async (tx) => {
    const deleted = await tx.query(
      'DELETE FROM images WHERE id = $1 RETURNING id',
      [imageId],
    )
    if (deleted.rowCount !== 1)
      return { ok: false as const, status: 404 as const }
    await activity.record(tx, {
      actor: userId,
      trip: image.trip_id,
      action: 'image.delete',
      entityId: imageId,
      metadata: { spot: image.title },
    })
    return { ok: true as const }
  })
}

async function spotTrip(
  db: Pool | PoolClient,
  spotId: string,
): Promise<{ id: string; tripId: string; title: string } | null> {
  const result = await db.query<{ id: string; trip_id: string; title: string }>(
    'SELECT id, trip_id, title FROM spots WHERE id = $1',
    [spotId],
  )
  const row = result.rows[0]
  if (!row) return null
  return { id: row.id, tripId: row.trip_id, title: row.title }
}

function toImage(row: ImageRow, secret: string, now: Date): ImageRecord {
  return {
    id: row.id,
    tripId: row.trip_id,
    spotId: row.spot_id,
    url: signImagePath(row.id, secret, now),
    bytes: Number(row.bytes),
    width: Number(row.width),
    height: Number(row.height),
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at.toISOString(),
    sourceUrl: row.source_url,
    credit: row.credit,
    license: row.license,
  }
}

function isForeignKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23503'
  )
}
