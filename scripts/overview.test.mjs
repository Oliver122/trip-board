import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, URL } from 'node:url'
import { checkOverview, coreAreaNames } from './overview/check.mjs'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const document = readFileSync(join(root, 'docs', 'SYSTEM_OVERVIEW.md'), 'utf8')

const messages = (markdown, options) => checkOverview(markdown, root, options)

/** Asserts that exactly the messages matching `expected` appear. */
function assertProblem(markdown, expected, options) {
  const found = messages(markdown, options)
  assert.ok(
    found.some((message) => expected.test(message)),
    `expected a message matching ${expected}, got:\n${found.join('\n') || '(none)'}`,
  )
  return found
}

// The last table row of the Issues section, so a new row extends the table.
const lastIssueRow = document
  .split('\n')
  .filter((line) => /^\| I-\d\d /.test(line))
  .at(-1)

function appendRow(row) {
  return document.replace(lastIssueRow, `${lastIssueRow}\n${row}`)
}

function issueRow(id, severity, category, evidence) {
  return `| ${id} | ${severity} | ${category} | Test issue | Test consequence | ${evidence} | Test fix |`
}

test('T-37-01 the written document passes every check', () => {
  assert.deepEqual(messages(document), [])
})

test('T-37-01 a missing Issues section fails', () => {
  const without = document.replace(
    /\n## Issues\n[\s\S]*?(?=\n## How to keep)/,
    '',
  )
  assertProblem(without, /Missing section "## Issues"/)
})

test('T-37-01 sections out of order fail', () => {
  const swapped = document
    .replace('## Operations', '## TMP')
    .replace('## Data and privacy', '## Operations')
    .replace('## TMP', '## Data and privacy')
  assertProblem(swapped, /out of order/)
})

test('T-37-01 a core area without a subsection fails (fake zz.md)', () => {
  const areas = [...coreAreaNames(root), 'zz']
  assertProblem(
    document,
    /Core area "zz" has no ### subsection under Core functionality/,
    { coreAreas: areas },
  )
})

test('T-37-01 a core area dropped from the document fails', () => {
  const without = document.replaceAll('core/spots.md', 'core/gone.md')
  assertProblem(without, /Core area "spots" has no ### subsection/)
})

test('T-37-01 a missing integration subsection fails', () => {
  const without = document.replace(
    '### Wikimedia Commons (photo suggestions)',
    '### Photo source (photo suggestions)',
  )
  assertProblem(
    without,
    /Outside integration "Wikimedia Commons" has no ### subsection/,
  )
})

test('T-37-01 a missing Timeout and failure row fails', () => {
  const without = document
    .split('\n')
    .filter((line, index, all) => {
      if (!line.startsWith('| Timeout and failure')) return true
      // Only drop the first one, in the Discord table.
      return (
        all.findIndex((other) => other.startsWith('| Timeout and failure')) !==
        index
      )
    })
    .join('\n')
  assertProblem(
    without,
    /Integration "Discord" lacks the row "Timeout and failure"/,
  )
})

test('T-37-01 severity critical fails', () => {
  assertProblem(
    appendRow(issueRow('I-90', 'critical', 'ops', '`package.json`')),
    /Issue I-90: invalid severity "critical"/,
  )
})

test('T-37-01 an invalid category fails', () => {
  assertProblem(
    appendRow(issueRow('I-90', 'low', 'weather', '`package.json`')),
    /Issue I-90: invalid category "weather"/,
  )
})

test('T-37-01 a duplicate ID fails', () => {
  assertProblem(
    appendRow(issueRow('I-01', 'low', 'ops', '`package.json`')),
    /Issue I-01: duplicate ID/,
  )
})

test('T-37-01 an I-03 before a higher-severity I-02 fails', () => {
  const rows = [
    issueRow('I-02', 'high', 'security', '`package.json`'),
    issueRow('I-03', 'medium', 'security', '`package.json`'),
  ]
  const [high, medium] = rows
  const table = document.split('\n').filter((line) => !/^\| I-\d\d /.test(line))
  const header = table.findIndex((line) => line.startsWith('| ID'))
  const broken = [
    ...table.slice(0, header + 2),
    medium,
    high,
    ...table.slice(header + 2),
  ].join('\n')
  assertProblem(broken, /Issue I-02: out of sort order/)
})

test('T-37-01 a category after a later category of the same severity fails', () => {
  assertProblem(
    appendRow(issueRow('I-90', 'low', 'security', '`package.json`')),
    /Issue I-90: out of sort order/,
  )
})

test('T-37-01 evidence apps/api/src/nope.ts fails', () => {
  assertProblem(
    appendRow(issueRow('I-90', 'low', 'ops', '`apps/api/src/nope.ts`')),
    /Issue I-90 evidence: evidence path apps\/api\/src\/nope\.ts does not exist/,
  )
})

test('T-37-01 evidence apps/api/src/app.ts:99999 fails', () => {
  assertProblem(
    appendRow(issueRow('I-90', 'low', 'ops', '`apps/api/src/app.ts:99999`')),
    /line 99999 is past the end of apps\/api\/src\/app\.ts/,
  )
})

test('T-37-01 evidence C-SPOT-99 fails', () => {
  assertProblem(
    appendRow(issueRow('I-90', 'low', 'ops', '`C-SPOT-99`')),
    /core ID C-SPOT-99 is not in requirements\/core/,
  )
})

test('T-37-01 evidence T-99-01 fails', () => {
  assertProblem(
    appendRow(issueRow('I-90', 'low', 'ops', '`T-99-01`')),
    /test ID T-99-01 is not in any step file/,
  )
})

test('T-37-01 an empty Evidence cell fails', () => {
  assertProblem(
    appendRow(issueRow('I-90', 'low', 'ops', 'none')),
    /Issue I-90: the Evidence cell holds no reference/,
  )
})

test('T-37-01 valid references pass', () => {
  const ok = appendRow(
    issueRow(
      'I-90',
      'low',
      'ops',
      '`apps/api/src/app.ts:1`, `C-SPOT-01`, `T-37-01`',
    ),
  )
  assert.deepEqual(messages(ok), [])
})

test('T-37-02 pnpm test runs the overview check', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const scripts = manifest.scripts
  assert.match(scripts.test, /test:req/, 'pnpm test must run test:req')
  assert.match(
    scripts['test:req'],
    /scripts\/\*\*\/\*\.test\.mjs|scripts\/overview\.test\.mjs/,
    'test:req must include scripts/overview.test.mjs',
  )
})

test('T-37-02 the check CLI exits non-zero on a broken document and zero on the real one', () => {
  const cli = join(root, 'scripts', 'overview', 'check.mjs')
  const ok = spawnSync(process.execPath, [cli], { encoding: 'utf8' })
  assert.equal(ok.status, 0, ok.stderr)

  const dir = mkdtempSync(join(tmpdir(), 'overview-'))
  try {
    const broken = join(dir, 'broken.md')
    writeFileSync(broken, document.replace('## Issues', '## Problems'))
    const bad = spawnSync(process.execPath, [cli, broken], { encoding: 'utf8' })
    assert.notEqual(bad.status, 0)
    assert.match(bad.stderr, /Missing section "## Issues"/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
