// Work list and note stubs for the per-screenshot review (step 41, R-41-02).
// Pure: orderImages and stubFor; the CLI reads the JPEG directory and writes missing stubs.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { imageNames, parseImage } from './notes.mjs'

/**
 * @param {string[]} files JPEG file names, e.g. `login-390-light.jpg`
 * @returns {{ ordered: string[], invalid: string[] }} image names in review order; files that are no valid image
 */
export function orderImages(files) {
  const rank = new Map(imageNames().map((name, index) => [name, index]))
  const ordered = []
  const invalid = []
  for (const file of files) {
    const name = file.replace(/\.jpg$/, '')
    if (parseImage(name) === null) invalid.push(file)
    else ordered.push(name)
  }
  ordered.sort((a, b) => rank.get(a) - rank.get(b))
  return { ordered, invalid }
}

/** The note a reviewer starts from; its empty Seen section fails notes.mjs. */
export function stubFor(name) {
  const image = parseImage(name)
  return `# ${name}

- Screen: ${image.screen}
- Width: ${image.width}
- Theme: ${image.theme}
- Locale: ${image.locale}

## Seen

## Problems

## Raw checks
`
}

const entry = process.argv[1]
if (entry && fileURLToPath(import.meta.url) === entry) {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
  const args = process.argv.slice(2)
  const flag = args.indexOf('--notes')
  const notesArg = flag === -1 ? undefined : args[flag + 1]
  if (flag !== -1) args.splice(flag, 2)
  const dir = resolve(root, args[0] ?? 'test-results/ui-review')
  const notesDir = resolve(root, notesArg ?? 'docs/ui-review/notes')
  if (!existsSync(dir)) {
    console.error(`${dir} does not exist; run pnpm ui:review first`)
    process.exit(1)
  }
  const { ordered, invalid } = orderImages(
    readdirSync(dir).filter((file) => file.endsWith('.jpg')),
  )
  if (invalid.length > 0) {
    for (const file of invalid) {
      console.error(
        `${file}: not <screen>-<width>-<light|dark>[-de].jpg for a known screen and width`,
      )
    }
    process.exit(1)
  }
  mkdirSync(notesDir, { recursive: true })
  for (const name of ordered) {
    console.log(name)
    const note = join(notesDir, `${name}.md`)
    if (!existsSync(note)) writeFileSync(note, stubFor(name))
  }
}
