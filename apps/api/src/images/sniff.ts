const heicBrands = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heif',
  'mif1',
  'msf1',
])

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'heic'

/** Type from the bytes themselves. A renamed PDF or text file is rejected. */
export function sniffImage(bytes: Buffer): ImageKind | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'jpeg'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png'
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const brand = bytes.toString('ascii', 8, 12).toLowerCase()
    if (heicBrands.has(brand)) return 'heic'
  }
  return null
}
