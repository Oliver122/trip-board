/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPhotoForm, exifTimeToTakenAt, readPhotoMeta } from './exif'

// Vitest runs from apps/web; jsdom's import.meta.url is not a file URL.
const dir = join(process.cwd(), 'src/photobook/fixtures')

function fixture(name: string, type: string): File {
  return new File([readFileSync(join(dir, name))], name, { type })
}

describe('photo EXIF reader', () => {
  it('T-47-07 reads GPS and the capture time of a JPEG, without a zone shift', async () => {
    const meta = await readPhotoMeta(fixture('gps-shibuya.jpg', 'image/jpeg'))
    expect(meta.lat).toBeCloseTo(35.6586, 4)
    expect(meta.lng).toBeCloseTo(139.7016, 4)
    expect(meta.takenAt).toBe('2026-04-14T09:30:00')
    const kyoto = await readPhotoMeta(fixture('gps-kyoto.jpg', 'image/jpeg'))
    expect(kyoto.lat).toBeCloseTo(34.995, 4)
    expect(kyoto.lng).toBeCloseTo(135.785, 4)
    expect(kyoto.takenAt).toBe('2026-04-19T16:20:00')
  })

  it('T-47-07 reads GPS and the capture time of a HEIC', async () => {
    const meta = await readPhotoMeta(fixture('gps.heic', 'image/heic'))
    expect(meta.lat).toBeCloseTo(35.6586, 4)
    expect(meta.lng).toBeCloseTo(139.7016, 4)
    expect(meta.takenAt).toBe('2026-04-14T09:30:00')
  })

  it('T-47-07 yields nothing, and no error, for a PNG without EXIF', async () => {
    expect(await readPhotoMeta(fixture('no-gps.png', 'image/png'))).toEqual({
      lat: null,
      lng: null,
      takenAt: null,
    })
  })

  it('T-47-07 yields nothing, and no error, for a corrupt file', async () => {
    expect(await readPhotoMeta(fixture('corrupt.jpg', 'image/jpeg'))).toEqual({
      lat: null,
      lng: null,
      takenAt: null,
    })
  })

  it('T-47-07 turns an EXIF time into a wall-clock string and refuses anything else', () => {
    expect(exifTimeToTakenAt('2026:04:14 09:30:00')).toBe('2026-04-14T09:30:00')
    expect(exifTimeToTakenAt('0000:00:00 00:00:00')).toBeNull()
    expect(exifTimeToTakenAt('2026:13:40 09:30:00')).toBeNull()
    expect(exifTimeToTakenAt(undefined)).toBeNull()
  })

  it('T-47-07 builds form data with the text fields first and no lat/lng when locations are off', async () => {
    const file = fixture('gps-shibuya.jpg', 'image/jpeg')
    const meta = await readPhotoMeta(file)

    const on = buildPhotoForm(file, meta, true)
    expect([...on.keys()]).toEqual(['lat', 'lng', 'takenAt', 'file'])
    expect(Number(on.get('lat'))).toBeCloseTo(35.6586, 4)

    const off = buildPhotoForm(file, meta, false)
    expect(off.has('lat')).toBe(false)
    expect(off.has('lng')).toBe(false)
    expect(off.get('takenAt')).toBe('2026-04-14T09:30:00')
    expect([...off.keys()]).toEqual(['takenAt', 'file'])

    const bare = buildPhotoForm(
      file,
      { lat: null, lng: null, takenAt: null },
      true,
    )
    expect([...bare.keys()]).toEqual(['file'])
  })
})
