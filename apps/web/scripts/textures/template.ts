import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  kindSymbolGlyphs,
  kindSymbolIcons,
  kindSymbols,
  type KindSymbol,
} from '@tripboard/shared'
import * as lucide from 'lucide-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { atlasCell, atlasGrid, atlasSize } from './atlas'

const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const referenceGrey = '#c4c4c4'
const guideGrey = '#7a7a7a'
const iconSize = 56

function iconMarkup(symbol: KindSymbol): string {
  const name = kindSymbolIcons[symbol]
  if (name) {
    const Icon = (lucide as unknown as Record<string, unknown>)[name]
    if (!Icon) throw new Error(`lucide-react has no icon ${name}`)
    return renderToStaticMarkup(
      createElement(Icon as lucide.LucideIcon, {
        size: iconSize,
        color: referenceGrey,
        strokeWidth: 2,
      }),
    )
  }
  return ''
}

/** The light grey reference symbol, centered in the cell at (0, 0). */
function referenceSymbol(symbol: KindSymbol): string {
  const markup = iconMarkup(symbol)
  const offset = (atlasCell - iconSize) / 2
  if (markup) {
    return markup.replace('<svg', `<svg x="${offset}" y="${offset}"`)
  }
  const glyph = kindSymbolGlyphs[symbol]
  if (glyph) {
    return `<text x="${atlasCell / 2}" y="${atlasCell / 2 + 20}" text-anchor="middle" font-family="sans-serif" font-size="56" font-weight="700" fill="${referenceGrey}">${glyph}</text>`
  }
  return `<circle cx="${atlasCell / 2}" cy="${atlasCell / 2}" r="9" fill="${referenceGrey}"/>`
}

function cellMarkup(symbol: KindSymbol, index: number): string {
  const left = (index % atlasGrid) * atlasCell
  const top = Math.floor(index / atlasGrid) * atlasCell
  const half = atlasCell / 2
  return `<g transform="translate(${left} ${top})">
<circle cx="${half}" cy="${half}" r="${half - 1}" fill="none" stroke="${guideGrey}" stroke-width="1" stroke-dasharray="4 3"/>
${referenceSymbol(symbol)}
<text x="4" y="11" font-family="sans-serif" font-size="9" fill="${guideGrey}">${index}</text>
<text x="4" y="${atlasCell - 5}" font-family="sans-serif" font-size="8" fill="${guideGrey}">${symbol}</text>
</g>`
}

/** The template as SVG: grid, guides, labels and reference symbols. */
export function templateSvg(): string {
  const lines: string[] = []
  for (let k = 0; k < atlasGrid; k += 1) {
    const at = k * atlasCell
    lines.push(
      `<rect x="${at}" y="0" width="1" height="${atlasSize}" fill="${guideGrey}"/>`,
      `<rect x="0" y="${at}" width="${atlasSize}" height="1" fill="${guideGrey}"/>`,
    )
  }
  lines.push(
    `<rect x="${atlasSize - 1}" y="0" width="1" height="${atlasSize}" fill="${guideGrey}"/>`,
    `<rect x="0" y="${atlasSize - 1}" width="${atlasSize}" height="1" fill="${guideGrey}"/>`,
  )
  const cells = kindSymbols.map(cellMarkup)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${atlasSize}" height="${atlasSize}" viewBox="0 0 ${atlasSize} ${atlasSize}">
${lines.join('\n')}
${cells.join('\n')}
</svg>`
}

/** The template PNG: 1024x1024, transparent, no metadata, fixed encoder options. */
export async function templatePng(): Promise<Buffer> {
  return sharp(Buffer.from(templateSvg()), { density: 72 })
    .ensureAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer()
}

const tableStart = '<!-- symbols:start -->'
const tableEnd = '<!-- symbols:end -->'

/** README table: cell index, row and column, symbol key, English name. */
export function symbolTable(names: Record<string, string>): string {
  const rows = kindSymbols.map((symbol, index) => {
    const row = Math.floor(index / atlasGrid) + 1
    const column = (index % atlasGrid) + 1
    return `| ${index} | ${row} | ${column} | \`${symbol}\` | ${names[symbol] ?? symbol} |`
  })
  return [
    '| Cell | Row | Column | Key | Name |',
    '| ---: | ---: | ---: | --- | --- |',
    ...rows,
  ].join('\n')
}

/** Rewrites the generated table inside the artist brief. */
export function withSymbolTable(readme: string, table: string): string {
  const start = readme.indexOf(tableStart)
  const end = readme.indexOf(tableEnd)
  if (start < 0 || end < start) {
    throw new Error('docs/textures/README.md lacks the symbols markers')
  }
  return `${readme.slice(0, start + tableStart.length)}\n${table}\n${readme.slice(end)}`
}

async function main() {
  const outPng = `${repo}docs/textures/kind-symbols-template.png`
  await writeFile(outPng, await templatePng())

  const readmePath = `${repo}docs/textures/README.md`
  const locale = JSON.parse(
    await readFile(`${repo}apps/web/src/locales/en/common.json`, 'utf8'),
  ) as { kinds: { symbols: Record<string, string> } }
  const readme = await readFile(readmePath, 'utf8')
  await writeFile(
    readmePath,
    withSymbolTable(readme, symbolTable(locale.kinds.symbols)),
  )
  console.log('textures: wrote docs/textures/kind-symbols-template.png')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
