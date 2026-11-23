// Generates the EXIF fixtures of the photobook tests (T-47-07, T-47-08).
// Run: node apps/web/src/photobook/fixtures/make-fixtures.mjs
import { execFileSync } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))

function dms(value) {
  const abs = Math.abs(value)
  const deg = Math.floor(abs)
  const min = Math.floor((abs - deg) * 60)
  const sec = ((abs - deg) * 60 - min) * 60
  return `${deg}/1 ${min}/1 ${Math.round(sec * 100)}/100`
}

function exifFor(lat, lng, takenAt) {
  return {
    IFD0: { Make: 'TripBoard', Model: 'Fixture' },
    IFD2: { DateTimeOriginal: takenAt },
    IFD3: {
      GPSLatitudeRef: lat >= 0 ? 'N' : 'S',
      GPSLatitude: dms(lat),
      GPSLongitudeRef: lng >= 0 ? 'E' : 'W',
      GPSLongitude: dms(lng),
    },
  }
}

function base(color) {
  return sharp({
    create: {
      width: 320,
      height: 240,
      channels: 3,
      background: color,
    },
  })
}

const jpeg = async (name, color, lat, lng, takenAt) => {
  const out = join(here, name)
  await base(color)
    .jpeg({ quality: 60 })
    .withExif(exifFor(lat, lng, takenAt))
    .toFile(out)
  return out
}

const shibuya = await jpeg(
  'gps-shibuya.jpg',
  '#c0392b',
  35.6586,
  139.7016,
  '2026:04:14 09:30:00',
)
await jpeg('gps-kyoto.jpg', '#2e86c1', 34.995, 135.785, '2026:04:19 16:20:00')

// HEIC: heif-enc keeps the EXIF of its JPEG input.
const heic = join(here, 'gps.heic')
execFileSync('heif-enc', [shibuya, '-q', '40', '-o', heic])
// libheif stores each item's position as `base_offset` with extent offset 0,
// which exifr does not add up (iPhone files use extent offsets). Move the base
// into the extent offset so exifr finds the EXIF block.
const raw = readFileSync(heic)
const iloc = raw.indexOf('iloc') + 4
let at = iloc + 4 // version and flags
const sizes = [raw[at] >> 4, raw[at] & 15, raw[at + 1] >> 4, raw[at + 1] & 15]
if (raw[iloc] !== 0 || sizes.join() !== '4,4,4,0') {
  throw new Error(`unexpected iloc layout: v${raw[iloc]} ${sizes.join()}`)
}
at += 2
let items = raw.readUInt16BE(at)
at += 2
while (items--) {
  at += 4 // item id, data reference index
  const base = raw.readUInt32BE(at)
  raw.writeUInt32BE(0, at)
  at += 4
  const extents = raw.readUInt16BE(at)
  at += 2
  for (let i = 0; i < extents; i++) {
    raw.writeUInt32BE(raw.readUInt32BE(at) + base, at)
    at += 8
  }
}
writeFileSync(heic, raw)

await base('#27ae60').png().toFile(join(here, 'no-gps.png'))

const jpegHead = await base('#8e44ad').jpeg({ quality: 50 }).toBuffer()
writeFileSync(
  join(here, 'corrupt.jpg'),
  Buffer.concat([
    jpegHead.subarray(0, 40),
    Buffer.from('not a real jpeg, only garbage follows '.repeat(20)),
  ]),
)
