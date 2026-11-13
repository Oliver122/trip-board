import sharp from 'sharp'

const longestSide = 2048

export type ProcessedImage = {
  data: Buffer
  width: number
  height: number
}

/** Auto-rotate, drop EXIF/GPS, fit inside 2048 px, and encode WebP. */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  // Pinned explicitly (sharp's default, 16383 x 16383): a larger declared
  // bitmap fails to decode instead of exhausting memory (R-44-07).
  const { data, info } = await sharp(input, { limitInputPixels: 268402689 })
    .rotate()
    .resize({
      width: longestSide,
      height: longestSide,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true })

  if (!info.width || !info.height) throw new Error('missing dimensions')
  return { data, width: info.width, height: info.height }
}
