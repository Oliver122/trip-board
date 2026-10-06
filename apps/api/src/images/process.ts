import sharp from 'sharp'

const longestSide = 2048

export type ProcessedImage = {
  data: Buffer
  width: number
  height: number
}

/** Auto-rotate, drop EXIF/GPS, fit inside 2048 px, and encode WebP. */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const { data, info } = await sharp(input)
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
