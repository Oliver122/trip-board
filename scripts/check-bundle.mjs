import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const dist = 'apps/web/dist'
const budget = 250 * 1024
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const initial = new Set()

for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)) {
  initial.add(match[1].slice(1))
}

if (initial.size === 0) {
  console.error('No JavaScript found in apps/web/dist/index.html')
  process.exit(1)
}

let total = 0
for (const relative of initial) {
  const file = join(dist, relative)
  const bytes = gzipSync(readFileSync(file)).length
  total += bytes
  const source = readFileSync(file, 'utf8')
  if (source.includes('maplibre')) {
    console.error(`Map library is in the first-route bundle: ${relative}`)
    process.exit(1)
  }
}

const assets = readdirSync(join(dist, 'assets'))
const mapChunk = assets.find((name) => {
  if (!name.endsWith('.js')) return false
  return readFileSync(join(dist, 'assets', name), 'utf8').includes(
    'maplibre-gl',
  )
})
if (!mapChunk) {
  console.error('Expected a separate chunk that loads maplibre-gl')
  process.exit(1)
}
if (initial.has(`assets/${mapChunk}`)) {
  console.error(`Map chunk is preloaded on the first route: ${mapChunk}`)
  process.exit(1)
}

const importChunk = assets.find((name) => name.startsWith('ImportDialog-'))
if (!importChunk) {
  console.error('Expected a separate chunk for the Google Maps import dialog')
  process.exit(1)
}
if (initial.has(`assets/${importChunk}`)) {
  console.error(`Import chunk is preloaded on the first route: ${importChunk}`)
  process.exit(1)
}

if (total > budget) {
  console.error(
    `First-route JS is ${total} bytes gzip, above the ${budget} byte budget`,
  )
  process.exit(1)
}

const mapBytes = statSync(join(dist, 'assets', mapChunk)).size
console.log(
  `First-route JS ${total} bytes gzip (budget ${budget}). Map chunk ${mapChunk} (${mapBytes} bytes) is lazy.`,
)
