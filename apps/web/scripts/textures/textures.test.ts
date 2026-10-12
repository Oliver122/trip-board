import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { manifestOf } from './atlas'
import { fixtureAtlas } from './fixture'
import { symbolTable, templatePng, withSymbolTable } from './template'

const run = promisify(execFile)
const manifestScript = fileURLToPath(new URL('./manifest.ts', import.meta.url))
const tsx = fileURLToPath(
  new URL('../../node_modules/.bin/tsx', import.meta.url),
)

async function cli(png: Buffer | null) {
  const dir = await mkdtemp(join(tmpdir(), 'textures-'))
  const out = join(dir, 'manifest.json')
  try {
    const pngPath = join(dir, 'atlas.png')
    if (png) await writeFile(pngPath, png)
    const result = await run(tsx, [
      manifestScript,
      '--png',
      pngPath,
      '--out',
      out,
    ]).then(
      () => ({ code: 0, stderr: '' }),
      (error: { code: number; stderr: string }) => error,
    )
    const written = result.code === 0 ? await readFile(out, 'utf8') : null
    return { ...result, manifest: written ? JSON.parse(written) : null }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('texture template', () => {
  it('T-29-16 is deterministic, 1024x1024 with alpha, corner clear and grid line drawn', async () => {
    const first = await templatePng()
    const second = await templatePng()
    expect(first.equals(second)).toBe(true)
    const { data, info } = await sharp(first)
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect([info.width, info.height, info.channels]).toEqual([1024, 1024, 4])
    const alpha = (x: number, y: number) => data[(y * 1024 + x) * 4 + 3]
    // Inside cell 1, near its top-left corner but off the grid line.
    expect(alpha(128 + 3, 3)).toBe(0)
    // On the vertical grid line between cells 0 and 1.
    expect(alpha(128, 64)).toBeGreaterThan(0)
  })

  it('T-29-16 the brief table lists every symbol and is replaced in place', () => {
    const table = symbolTable({ coffee: 'Coffee' })
    expect(table).toContain('| 6 | 1 | 7 | `coffee` | Coffee |')
    expect(table.split('\n')).toHaveLength(66)
    const readme = withSymbolTable(
      'a\n<!-- symbols:start -->\nold\n<!-- symbols:end -->\nb',
      table,
    )
    expect(readme).not.toContain('old')
    expect(readme.startsWith('a\n<!-- symbols:start -->\n| Cell')).toBe(true)
  })
})

describe('texture manifest', () => {
  it('T-29-18 a missing PNG gives an empty manifest', async () => {
    const result = await cli(null)
    expect(result.code).toBe(0)
    expect(result.manifest).toEqual({ version: 'none', filled: [] })
  })

  it('T-29-18 cells 5 and 11 filled give [5, 11]', async () => {
    const png = await fixtureAtlas([
      { cell: 5, where: 'center' },
      { cell: 11, where: 'center' },
    ])
    const result = await cli(png)
    expect(result.code).toBe(0)
    expect(result.manifest.filled).toEqual([5, 11])
  })

  it('T-29-18 pixels only in the corners outside the circle do not fill a cell', async () => {
    const png = await fixtureAtlas([{ cell: 3, where: 'corners' }])
    expect((await manifestOf(png)).filled).toEqual([])
  })

  it('T-29-18 a 1000x1000 PNG exits non-zero with a clear message', async () => {
    const png = await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer()
    const result = await cli(png)
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('1024x1024')
  })

  it('T-29-18 the same PNG twice gives the same version, a changed one another', async () => {
    const a = await fixtureAtlas([{ cell: 5, where: 'center' }])
    const b = await fixtureAtlas([{ cell: 6, where: 'center' }])
    expect((await manifestOf(a)).version).toBe((await manifestOf(a)).version)
    expect((await manifestOf(a)).version).not.toBe(
      (await manifestOf(b)).version,
    )
  })
})
