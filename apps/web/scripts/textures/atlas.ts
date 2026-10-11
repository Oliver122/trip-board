import { createHash } from 'node:crypto'
import { format } from 'prettier'
import sharp from 'sharp'

/** The atlas is `grid` x `grid` cells of `cell` px (R-29-16). */
export const atlasGrid = 8
export const atlasCell = 128
export const atlasSize = atlasGrid * atlasCell

/** A pixel counts as drawn from this alpha on. */
export const alphaThreshold = 16
/** A cell is filled when this share of its circle's pixels is drawn. */
export const filledShare = 0.01

export type TextureManifest = {
  version: string
  filled: number[]
}

export const emptyManifest: TextureManifest = { version: 'none', filled: [] }

/** Content hash that busts the browser cache when the atlas changes. */
export function atlasVersion(png: Uint8Array): string {
  return createHash('sha256').update(png).digest('hex').slice(0, 12)
}

/**
 * Indexes of the cells with >= 1 % drawn pixels inside their inscribed circle.
 * `rgba` is the raw 4-channel image; pixels outside the circle are ignored.
 */
export function filledCells(rgba: Uint8Array, width: number): number[] {
  const radius = atlasCell / 2
  const filled: number[] = []
  for (let index = 0; index < atlasGrid * atlasGrid; index += 1) {
    const left = (index % atlasGrid) * atlasCell
    const top = Math.floor(index / atlasGrid) * atlasCell
    let inside = 0
    let drawn = 0
    for (let y = 0; y < atlasCell; y += 1) {
      for (let x = 0; x < atlasCell; x += 1) {
        const dx = x + 0.5 - radius
        const dy = y + 0.5 - radius
        if (dx * dx + dy * dy > radius * radius) continue
        inside += 1
        const alpha = rgba[((top + y) * width + left + x) * 4 + 3] ?? 0
        if (alpha >= alphaThreshold) drawn += 1
      }
    }
    if (drawn >= inside * filledShare) filled.push(index)
  }
  return filled
}

export class AtlasError extends Error {}

/** Manifest of a PNG atlas; throws {@link AtlasError} unless it is 1024x1024. */
export async function manifestOf(png: Buffer): Promise<TextureManifest> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.width !== atlasSize || info.height !== atlasSize) {
    throw new AtlasError(
      `The atlas must be exactly ${atlasSize}x${atlasSize} px, but it is ${info.width}x${info.height} px.`,
    )
  }
  return { version: atlasVersion(png), filled: filledCells(data, info.width) }
}

/** Manifest text as committed, formatted the way `prettier --check` wants it. */
export function manifestJson(manifest: TextureManifest): Promise<string> {
  return format(JSON.stringify(manifest), { parser: 'json' })
}
