import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  atlasCell,
  atlasGrid,
  atlasSize,
  manifestOf,
  manifestJson,
} from './atlas'

type Fill = { cell: number; where: 'center' | 'corners' }

/** A 1024x1024 atlas with the given cells drawn (opaque orange disc or corners). */
export async function fixtureAtlas(fills: readonly Fill[]): Promise<Buffer> {
  const shapes = fills.map(({ cell, where }) => {
    const left = (cell % atlasGrid) * atlasCell
    const top = Math.floor(cell / atlasGrid) * atlasCell
    if (where === 'center') {
      return `<circle cx="${left + 64}" cy="${top + 64}" r="50" fill="#ff8800"/>`
    }
    return [
      `<rect x="${left}" y="${top}" width="12" height="12" fill="#ff8800"/>`,
      `<rect x="${left + 116}" y="${top + 116}" width="12" height="12" fill="#ff8800"/>`,
    ].join('')
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${atlasSize}" height="${atlasSize}">${shapes.join('')}</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/** Regenerates e2e/fixtures/textures (cells 5 = food and 11 = cat filled). */
async function main() {
  const dir = fileURLToPath(
    new URL('../../../../e2e/fixtures/textures/', import.meta.url),
  )
  const png = await fixtureAtlas([
    { cell: 5, where: 'center' },
    { cell: 11, where: 'center' },
  ])
  await writeFile(`${dir}kind-symbols-fixture.png`, png)
  await writeFile(
    `${dir}texture-manifest.json`,
    await manifestJson(await manifestOf(png)),
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
