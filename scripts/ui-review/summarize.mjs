// Groups the raw check results of `pnpm ui:review` (step 40, R-40-06).
// node scripts/ui-review/summarize.mjs [--in <dir>] [--docs] [--docs-dir <dir>]
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')

const occurrenceOf = (result) =>
  `${result.width}-${result.theme}${result.locale === 'de' ? '-de' : ''}`

/** One group per check/screen/selector, sorted by occurrence count, then key. */
export function groupResults(results) {
  const groups = new Map()
  for (const result of results) {
    const key = `${result.check}/${result.screen}/${result.selector}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        check: result.check,
        screen: result.screen,
        selector: result.selector,
        name: result.name,
        occurrences: [],
      }
      groups.set(key, group)
    }
    const occurrence = occurrenceOf(result)
    if (!group.occurrences.includes(occurrence)) {
      group.occurrences.push(occurrence)
    }
  }
  for (const group of groups.values()) group.occurrences.sort()
  return [...groups.values()].sort(
    (a, b) =>
      b.occurrences.length - a.occurrences.length ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  )
}

/** Raw results counted by check and by width (every result, not every group). */
export function totals(results) {
  const perCheck = {}
  const perWidth = {}
  for (const result of results) {
    perCheck[result.check] = (perCheck[result.check] ?? 0) + 1
    perWidth[result.width] = (perWidth[result.width] ?? 0) + 1
  }
  return { perCheck, perWidth }
}

export function renderSummary({ commit, date, screenshots, results, groups }) {
  const { perCheck, perWidth } = totals(results)
  const list = (counts) =>
    Object.keys(counts).length === 0
      ? ['- none']
      : Object.entries(counts)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([name, count]) => `- ${name}: ${count}`)
  return [
    '# UI review summary',
    '',
    `Commit ${commit}, ${date}, ${screenshots} screenshots, ${results.length} results in ${groups.length} groups.`,
    '',
    '## Results per check',
    ...list(perCheck),
    '',
    '## Results per width',
    ...list(perWidth),
    '',
    '## Groups',
    ...(groups.length === 0
      ? ['- none']
      : groups.map(
          (group) =>
            `- ${group.key} — ${group.name} — ${group.occurrences.length}× (${group.occurrences.join(', ')})`,
        )),
    '',
  ].join('\n')
}

function parseArgs(argv) {
  const options = { in: 'test-results/ui-review', docs: false }
  options.docsDir = 'docs/ui-review'
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--docs') options.docs = true
    else if (arg === '--in') options.in = argv[++i]
    else if (arg === '--docs-dir') options.docsDir = argv[++i]
    else throw new Error(`Unknown argument ${arg}`)
    if (options.in === undefined || options.docsDir === undefined) {
      throw new Error(`${arg} needs a value`)
    }
  }
  return options
}

const fromRoot = (path) => (isAbsolute(path) ? path : resolve(root, path))

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'unknown'
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const dir = fromRoot(options.in)
  const rawDir = join(dir, 'raw')
  if (!existsSync(rawDir)) {
    console.error(
      `No raw results in ${rawDir}. Run "pnpm ui:review" (it needs "pnpm dev:e2e" and a seeded database) first.`,
    )
    process.exit(1)
  }
  const results = readdirSync(rawDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .flatMap((file) => JSON.parse(readFileSync(join(rawDir, file), 'utf8')))
  const screenshots = readdirSync(dir).filter((file) =>
    file.endsWith('.jpg'),
  ).length
  const groups = groupResults(results)
  const commit = currentCommit()
  const date = new Date().toISOString().slice(0, 10)
  const findings = { commit, date, screenshots, groups }
  const findingsPath = join(dir, 'findings.json')
  writeFileSync(findingsPath, `${JSON.stringify(findings, null, 2)}\n`)
  writeFileSync(
    join(dir, 'summary.md'),
    renderSummary({ commit, date, screenshots, results, groups }),
  )
  console.log(
    `${results.length} results in ${groups.length} groups, ${screenshots} screenshots: ${findingsPath}`,
  )
  if (options.docs) {
    const docsDir = fromRoot(options.docsDir)
    mkdirSync(docsDir, { recursive: true })
    copyFileSync(findingsPath, join(docsDir, 'findings.json'))
    console.log(`Copied findings.json to ${docsDir}`)
  }
}

const entry = process.argv[1]
if (entry && fileURLToPath(import.meta.url) === entry) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
