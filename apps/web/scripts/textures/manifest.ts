import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  AtlasError,
  emptyManifest,
  manifestJson,
  manifestOf,
  type TextureManifest,
} from './atlas'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** Reads the PNG if there is one; no file means nothing is filled. */
export async function buildManifest(pngPath: string): Promise<TextureManifest> {
  if (!existsSync(pngPath)) return emptyManifest
  return manifestOf(await readFile(pngPath))
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1]
    ? (process.argv[index + 1] as string)
    : fallback
}

async function main() {
  const png = option('--png', `${root}public/textures/kind-symbols.png`)
  const out = option('--out', `${root}src/kinds/texture-manifest.json`)
  try {
    const manifest = await buildManifest(png)
    await writeFile(out, await manifestJson(manifest))
    console.log(
      `textures: ${manifest.filled.length} of 64 cells filled (version ${manifest.version})`,
    )
  } catch (error) {
    if (error instanceof AtlasError) {
      console.error(`textures: ${error.message}`)
      process.exit(1)
    }
    throw error
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
