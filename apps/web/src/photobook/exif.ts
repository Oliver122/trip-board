import { takenAtSchema } from '@tripboard/shared'

/** What the browser could read from a photo before upload (R-47-08). */
export type PhotoMeta = {
  lat: number | null
  lng: number | null
  /** `YYYY-MM-DDTHH:MM:SS`, the camera's wall clock, never shifted. */
  takenAt: string | null
}

const noMeta: PhotoMeta = { lat: null, lng: null, takenAt: null }

/** `2026:04:14 09:30:00` (EXIF) to `2026-04-14T09:30:00`, or null if it is no real time. */
export function exifTimeToTakenAt(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(
    value.trim(),
  )
  if (!match) return null
  const text = `${match[1]}-${match[2]}-${match[3]}T${match[4]}`
  return takenAtSchema.safeParse(text).success ? text : null
}

function coordinate(value: unknown, limit: number): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= limit
    ? value
    : null
}

/**
 * Reads GPS and `DateTimeOriginal` in the browser (R-47-08). It never throws:
 * a file that cannot be read goes up without a point or time.
 */
export async function readPhotoMeta(file: Blob): Promise<PhotoMeta> {
  try {
    // Loaded on the first upload, so exifr stays out of the first-route bundle (C-OPS-17).
    const { default: exifr } = await import('exifr')
    // Two reads: `pick` would hide the GPS block that `gps()` converts to degrees.
    const gps = (await exifr.gps(file).catch(() => undefined)) as
      { latitude?: unknown; longitude?: unknown } | undefined
    const tags = (await exifr
      .parse(file, {
        pick: ['DateTimeOriginal'],
        // Keep the wall-clock string: a revived Date would shift by the viewer's zone.
        reviveValues: false,
      })
      .catch(() => undefined)) as Record<string, unknown> | undefined
    const lat = coordinate(gps?.latitude, 90)
    const lng = coordinate(gps?.longitude, 180)
    // A camera without a fix often writes 0, 0.
    const point = lat !== null && lng !== null && (lat !== 0 || lng !== 0)
    return {
      lat: point ? lat : null,
      lng: point ? lng : null,
      takenAt: exifTimeToTakenAt(tags?.DateTimeOriginal),
    }
  } catch {
    return noMeta
  }
}

/**
 * The multipart body of one upload: text fields first, then the file. With
 * `useLocations` off no `lat` / `lng` is sent, the capture time still is.
 */
export function buildPhotoForm(
  file: File,
  meta: PhotoMeta,
  useLocations: boolean,
): FormData {
  const body = new FormData()
  if (useLocations && meta.lat !== null && meta.lng !== null) {
    body.append('lat', String(meta.lat))
    body.append('lng', String(meta.lng))
  }
  if (meta.takenAt) body.append('takenAt', meta.takenAt)
  body.append('file', file)
  return body
}
