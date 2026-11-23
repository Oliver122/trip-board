import { randomUUID } from 'node:crypto'
import {
  photoLimits,
  photoSchema,
  type PatchImageBody,
  type Photo,
  type PlaceSource,
  type Quota,
} from '@tripboard/shared'
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
  spotId: string | null
  url: string
  bytes: number
  width: number
  height: number
  sortOrder: number
  createdAt: string
  sourceUrl: string | null
  credit: string | null
  license: string | null
  // Step 47: the photo's own point, camera time and caption.
  lat: number | null
  lng: number | null
  takenAt: string | null
  placeSource: PlaceSource | null
  caption: string | null
}

type ImageRow = {
  id: string
  trip_id: string
  spot_id: string | null
  bytes: number
  width: number
  height: number
  sort_order: number
  created_at: Date
  source_url: string | null
  credit: string | null
  license: string | null
  lat: number | null
  lng: number | null
  taken_at: string | null
  place_source: PlaceSource | null
  caption: string | null
}

// taken_at is a timestamp without a zone: read as text so it is never shifted.
const imageColumns = `id, trip_id, spot_id, bytes, width, height, sort_order, created_at, source_url, credit, license,
  lat, lng, to_char(taken_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS taken_at, place_source, caption`

type PhotoRow = {
  id: string
  trip_id: string
  bytes: number
  width: number
  height: number
  lat: number | null
  lng: number | null
  taken_at: string | null
  spot_id: string | null
  spot_title: string | null
  place_source: PlaceSource | null
  caption: string | null
  uploaded_by: string | null
  uploader_name: string | null
  created_at: Date
}

// Own point, else the spot's point (R-47-03).
const photoSelect = `
  SELECT i.id, i.trip_id, i.bytes, i.width, i.height,
    COALESCE(i.lat, s.lat) AS lat, COALESCE(i.lng, s.lng) AS lng,
    to_char(i.taken_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS taken_at,
    i.spot_id, s.title AS spot_title, i.place_source, i.caption,
    i.uploaded_by, COALESCE(u.display_name, u.username) AS uploader_name,
    i.created_at
  FROM images i
  LEFT JOIN spots s ON s.id = i.spot_id
  LEFT JOIN users u ON u.id = i.uploaded_by
`

/** Photobook fields of an upload (R-47-02). */
type PhotoInput = {
  lat?: number
  lng?: number
  takenAt?: string
  spotId?: string
  caption?: string
}

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
class NotFound extends Error {}

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
    max_file_bytes: string | number
  }>(
    `
    SELECT used_images, max_images, used_bytes, max_bytes, max_file_bytes
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
    maxFileBytes: Number(row.max_file_bytes),
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

/** Where an upload goes: a spot's gallery or the trip's photobook (R-47-02). */
export type UploadTarget =
  { spotId: string } | { tripId: string; photo: PhotoInput }

export async function storeImage(
  pool: Pool,
  storage: ObjectStorage,
  input: {
    userId: string
    target: UploadTarget
    image: ProcessedImage
    secret: string
    now: Date
    beforeInsert?: () => Promise<void>
    source?: ImageSource
  },
): Promise<
  | { ok: true; image: ImageRecord; photo?: Photo }
  | { ok: false; status: 403 | 404 | 409 | 413; quota?: Quota }
> {
  const target = input.target
  const spot = 'spotId' in target ? await spotTrip(pool, target.spotId) : null
  if ('spotId' in target && !spot) return { ok: false, status: 404 }
  const tripId = spot ? spot.tripId : 'tripId' in target ? target.tripId : ''
  const access = await requireTripRole(pool, tripId, input.userId, 'planner')
  if (!access.ok) return access

  const imageId = randomUUID()
  const key = spot
    ? `trips/${tripId}/spots/${spot.id}/${imageId}.webp`
    : `trips/${tripId}/photos/${imageId}.webp`
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
      if (spot && input.source?.kind === 'commons' && input.source.url) {
        const same = await tx.query(
          'SELECT 1 FROM images WHERE spot_id = $1 AND source_url = $2',
          [spot.id, input.source.url],
        )
        if ((same.rowCount ?? 0) > 0) throw new AlreadyAdded()
      }

      // A photobook photo links to the named spot, else the nearest one
      // within 150 m of its point (R-47-02).
      const photo = 'photo' in target ? target.photo : null
      const hasPoint = photo?.lat !== undefined && photo.lng !== undefined
      let linked: { id: string; title: string } | null = spot
      if (photo?.spotId) {
        linked = await spotOfTrip(tx, tripId, photo.spotId)
        if (!linked) throw new NotFound()
      } else if (photo && hasPoint) {
        linked = await nearestSpot(tx, tripId, photo.lat!, photo.lng!)
      }

      await storage.put(key, input.image.data)
      uploaded = true
      if (input.beforeInsert) await input.beforeInsert()

      const inserted = await tx.query<ImageRow>(
        `
        INSERT INTO images (
          id, trip_id, spot_id, uploaded_by, storage_key, bytes, width, height, sort_order,
          source_url, credit, license, lat, lng, taken_at, place_source, caption
        )
        VALUES (
          $1, $2, $3::uuid, $4, $5, $6, $7, $8,
          COALESCE((SELECT max(sort_order) + 1 FROM images WHERE spot_id = $3::uuid), 0),
          $9, $10, $11, $12, $13, $14::timestamp, $15, $16
        )
        RETURNING ${imageColumns}
        `,
        [
          imageId,
          tripId,
          linked?.id ?? null,
          input.userId,
          key,
          input.image.data.length,
          input.image.width,
          input.image.height,
          input.source?.url ?? null,
          input.source?.credit ?? null,
          input.source?.license ?? null,
          hasPoint ? photo.lat : null,
          hasPoint ? photo.lng : null,
          photo?.takenAt ?? null,
          hasPoint ? 'exif' : null,
          photo?.caption || null,
        ],
      )
      const row = inserted.rows[0]
      if (!row) throw new Error('insert failed')
      await activity.record(tx, {
        actor: input.userId,
        trip: tripId,
        action: 'image.upload',
        entityId: row.id,
        metadata: {
          ...(photo ? { source: 'photobook' } : {}),
          ...(linked ? { spot: linked.title } : {}),
          bytes: row.bytes,
          ...(input.source ? { source: input.source.kind } : {}),
        },
      })
      return {
        missing: false as const,
        row,
        photo: photo
          ? await readPhoto(tx, row.id, input.secret, input.now)
          : null,
      }
    })
    if (image.missing) return { ok: false, status: 404 }
    return {
      ok: true,
      image: toImage(image.row, input.secret, input.now),
      ...(image.photo ? { photo: image.photo } : {}),
    }
  } catch (error) {
    if (uploaded) {
      await storage.delete(key).catch(() => undefined)
    }
    if (error instanceof QuotaExceeded) {
      return { ok: false, status: 413, quota: error.quota }
    }
    if (error instanceof AlreadyAdded) return { ok: false, status: 409 }
    if (error instanceof NotFound || isForeignKey(error)) {
      return { ok: false, status: 404 }
    }
    throw error
  }
}

/** Every image of the trip, gallery photos included (R-47-03). */
export async function listPhotos(
  pool: Pool,
  tripId: string,
  userId: string,
  secret: string,
  now: Date,
): Promise<
  | { ok: true; photos: Photo[]; uploadsEnabled: boolean }
  | { ok: false; status: 403 | 404 }
> {
  const access = await requireTripRole(pool, tripId, userId, 'visitor')
  if (!access.ok) return access
  const rows = await pool.query<PhotoRow>(
    `${photoSelect}
    WHERE i.trip_id = $1
    ORDER BY i.taken_at ASC NULLS LAST, i.created_at, i.id`,
    [tripId],
  )
  return {
    ok: true,
    photos: rows.rows.map((row) => toPhoto(row, secret, now)),
    uploadsEnabled: await uploadsEnabled(pool),
  }
}

/** Places, moves, links or captions a photo (R-47-04). */
export async function patchImage(
  pool: Pool,
  imageId: string,
  userId: string,
  body: PatchImageBody,
  secret: string,
  now: Date,
): Promise<
  | { ok: true; photo: Photo }
  | { ok: false; status: 403 | 404 }
  | { ok: false; status: 400; error: 'would_unplace' }
> {
  const existing = await pool.query<{ trip_id: string }>(
    'SELECT trip_id FROM images WHERE id = $1',
    [imageId],
  )
  const tripId = existing.rows[0]?.trip_id
  if (!tripId) return { ok: false, status: 404 }
  const access = await requireTripRole(pool, tripId, userId, 'planner')
  if (!access.ok) return access

  try {
    return await withTransaction(pool, async (tx) => {
      const locked = await tx.query<{
        spot_id: string | null
        lat: number | null
      }>('SELECT spot_id, lat FROM images WHERE id = $1 FOR UPDATE', [imageId])
      const current = locked.rows[0]
      if (!current) return { ok: false as const, status: 404 as const }

      const hasPoint = body.lat !== undefined && body.lng !== undefined
      let spotId = current.spot_id
      let spotTitle: string | null = null
      if (body.spotId) {
        const named = await spotOfTrip(tx, tripId, body.spotId)
        if (!named) return { ok: false as const, status: 404 as const }
        spotId = named.id
        spotTitle = named.title
      } else if (body.spotId === null) {
        spotId = null
      } else if (hasPoint) {
        const near = await nearestSpot(tx, tripId, body.lat!, body.lng!)
        spotId = near?.id ?? null
        spotTitle = near?.title ?? null
      }
      // Unlinking must not leave a photo on neither the map nor a gallery.
      if (body.spotId === null && !hasPoint && current.lat === null) {
        return {
          ok: false as const,
          status: 400 as const,
          error: 'would_unplace' as const,
        }
      }
      if (spotId && !spotTitle) {
        spotTitle = (await spotOfTrip(tx, tripId, spotId))?.title ?? null
      }

      const sets: string[] = []
      const values: unknown[] = [imageId]
      const set = (column: string, value: unknown) => {
        values.push(value)
        sets.push(`${column} = $${values.length}`)
      }
      if (hasPoint) {
        set('lat', body.lat)
        set('lng', body.lng)
        set('place_source', 'manual')
      }
      if (spotId !== current.spot_id) {
        set('spot_id', spotId)
        if (spotId) {
          values.push(spotId)
          sets.push(
            `sort_order = COALESCE((SELECT max(sort_order) + 1 FROM images WHERE spot_id = $${values.length}), 0)`,
          )
        }
      }
      if (body.caption !== undefined) set('caption', body.caption || null)

      if (sets.length > 0) {
        await tx.query(
          `UPDATE images SET ${sets.join(', ')} WHERE id = $1`,
          values,
        )
        await activity.record(tx, {
          actor: userId,
          trip: tripId,
          action: 'image.update',
          entityId: imageId,
          metadata: {
            fields: (['lat', 'lng', 'spotId', 'caption'] as const).filter(
              (key) => body[key] !== undefined,
            ),
            ...(spotTitle ? { spot: spotTitle } : {}),
          },
        })
      }
      const photo = await readPhoto(tx, imageId, secret, now)
      return photo
        ? { ok: true as const, photo }
        : { ok: false as const, status: 404 as const }
    })
  } catch (error) {
    if (isForeignKey(error)) return { ok: false, status: 404 }
    throw error
  }
}

export async function removeImage(
  pool: Pool,
  imageId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
  // A photobook photo may have no spot (R-47-02).
  const existing = await pool.query<{ trip_id: string; title: string | null }>(
    `
    SELECT i.trip_id, s.title
    FROM images i
    LEFT JOIN spots s ON s.id = i.spot_id
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
      metadata: image.title ? { spot: image.title } : {},
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

async function spotOfTrip(
  db: Pool | PoolClient,
  tripId: string,
  spotId: string,
): Promise<{ id: string; title: string } | null> {
  const result = await db.query<{ id: string; title: string }>(
    'SELECT id, title FROM spots WHERE id = $1 AND trip_id = $2',
    [spotId, tripId],
  )
  return result.rows[0] ?? null
}

/** The trip's spot nearest to the point, within 150 m (great circle). */
async function nearestSpot(
  db: Pool | PoolClient,
  tripId: string,
  lat: number,
  lng: number,
): Promise<{ id: string; title: string } | null> {
  const result = await db.query<{ id: string; title: string }>(
    `
    SELECT id, title FROM (
      SELECT id, title,
        2 * 6371000 * asin(sqrt(least(1,
          power(sin(radians(lat - $2) / 2), 2)
          + cos(radians($2)) * cos(radians(lat))
            * power(sin(radians(lng - $3) / 2), 2)))) AS meters
      FROM spots
      WHERE trip_id = $1
    ) near
    WHERE meters <= $4
    ORDER BY meters, id
    LIMIT 1
    `,
    [tripId, lat, lng, photoLimits.linkRadiusMeters],
  )
  return result.rows[0] ?? null
}

async function readPhoto(
  db: Pool | PoolClient,
  imageId: string,
  secret: string,
  now: Date,
): Promise<Photo | null> {
  const result = await db.query<PhotoRow>(`${photoSelect} WHERE i.id = $1`, [
    imageId,
  ])
  const row = result.rows[0]
  return row ? toPhoto(row, secret, now) : null
}

function toPhoto(row: PhotoRow, secret: string, now: Date): Photo {
  return photoSchema.parse({
    id: row.id,
    tripId: row.trip_id,
    url: signImagePath(row.id, secret, now),
    width: Number(row.width),
    height: Number(row.height),
    bytes: Number(row.bytes),
    lat: row.lat,
    lng: row.lng,
    takenAt: row.taken_at,
    spotId: row.spot_id,
    spotTitle: row.spot_title,
    placeSource: row.place_source,
    caption: row.caption,
    uploadedBy: row.uploaded_by
      ? { id: row.uploaded_by, name: row.uploader_name ?? '' }
      : null,
    createdAt: row.created_at.toISOString(),
  })
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
    lat: row.lat,
    lng: row.lng,
    takenAt: row.taken_at,
    placeSource: row.place_source,
    caption: row.caption,
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
