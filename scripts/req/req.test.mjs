import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { URL, fileURLToPath } from 'node:url'
import { runCheck } from './check.mjs'
import { buildIndex, isPrettierClean, renderIndex } from './index.mjs'
import { loadModel, parseDepends } from './parse.mjs'

// Fixtures are written to a temp dir at test time (prettier would reformat committed
// markdown tables). Fixture steps use numbers 91-93 so their IDs never collide with real ones.

const REPO = fileURLToPath(new URL('../../', import.meta.url))
const CLI = fileURLToPath(new URL('./req.mjs', import.meta.url))
const HEAD =
  '| ID | Rule | Status | Since | Changed by | Tests |\n| --- | --- | --- | --- | --- | --- |'

function step(
  num,
  title,
  {
    depends = '—',
    core = '—',
    status = 'planned',
    changes = '',
    tests = '',
  } = {},
) {
  return `# Step ${num} — ${title}

**Goal:** fixture.
**Depends on:** ${depends}
**Result:** ${title} works
**Core:** ${core}
**Status:** ${status}

## Requirements
| ID | Requirement |
| --- | --- |
| R-${num}-01 | thing |
${changes}
## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-${num}-01 | api | R-${num}-01 | an api test |
| T-${num}-02 | manual | R-${num}-01 | look at it |
${tests}`
}

function validFiles() {
  return {
    'requirements/91-alpha.md': step('91', 'Alpha', {
      core: 'C-SPOT-01, C-SPOT-02',
      status: 'integrated 2026-10-11',
      changes:
        '\n## Core changes\n| Core ID | Change | From |\n| --- | --- | --- |\n| C-SPOT-01 | add | R-91-01 |\n| C-SPOT-02 | add | R-91-01 |\n',
    }),
    'requirements/92-beta.md': step('92', 'Beta', {
      depends: '91 (alpha)',
      core: 'C-KIND-01',
      status: 'integrated 2026-10-11',
      changes:
        '\n## Core changes\n| Core ID | Change | From |\n| --- | --- | --- |\n| C-KIND-01 | add | R-92-01 |\n',
    }),
    'requirements/93-gamma.md': step('93', 'Gamma', {
      depends: '92 (steps 91 and 92 …)',
      changes:
        '\n## Core changes\n| Core ID | Change | From |\n| --- | --- | --- |\n| C-KIND-01 | modify | R-93-01 |\n',
    }),
    'requirements/core/spots.md': `# Core — Spots

Spots live here. See [kinds](./kinds.md).

${HEAD}
| C-SPOT-01 | Creates a spot, e.g. via the API. Second sentence. <!-- R-91-01 --> | active | 91 | — | T-91-01, T-91-02 |
| C-SPOT-02 | A rule without a test. | active | 91 | — | — |

## Known gaps

- C-SPOT-02: no test proves it.
`,
    'requirements/core/kinds.md': `# Core — Kinds

Kinds live here.

${HEAD}
| C-KIND-01 | A kind has a color. <!-- R-92-01 --> | active | 92 | — | T-91-01 |
`,
    'apps/api/src/alpha.test.ts': "// T-91-01\ntest('x', () => {})\n",
  }
}

function writeTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'req-fixture-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return root
}

// mutate(files) edits the fixture; the INDEX is rebuilt afterwards unless `stale`.
async function fixture(mutate = () => {}, { stale = false } = {}) {
  const files = validFiles()
  let index = null
  if (stale) index = await buildIndex(loadModel(writeTree(files)))
  mutate(files)
  const root = writeTree(files)
  fs.writeFileSync(
    path.join(root, 'requirements/INDEX.md'),
    index ?? (await buildIndex(loadModel(root))),
  )
  return root
}

const check = (root) => runCheck(loadModel(root))
const lineOf = (text, needle) =>
  text.split('\n').findIndex((l) => l.includes(needle)) + 1

test('T-30-01 valid fixture passes; duplicate/wrong-area/missing-column/malformed IDs fail with file:line', async () => {
  assert.deepEqual(await check(await fixture()), [])

  const dup = validFiles()
  dup['requirements/core/spots.md'] = dup['requirements/core/spots.md'].replace(
    '| C-SPOT-02 |',
    '| C-SPOT-01 |',
  )
  const dupRoot = await fixture((f) =>
    Object.assign(f, {
      'requirements/core/spots.md': dup['requirements/core/spots.md'],
    }),
  )
  const dupLine = lineOf(
    dup['requirements/core/spots.md'],
    'A rule without a test',
  )
  assert.ok(
    (await check(dupRoot)).some(
      (p) =>
        p.startsWith(`requirements/core/spots.md:${dupLine}: `) &&
        p.includes('duplicate core ID C-SPOT-01'),
    ),
  )

  let wrongText
  const wrongRoot = await fixture((f) => {
    wrongText =
      f['requirements/core/kinds.md'] +
      '| C-SPOT-03 | Wrong place. | active | 92 | — | T-91-01 |\n'
    f['requirements/core/kinds.md'] = wrongText
  })
  const wrongLine = lineOf(wrongText, 'C-SPOT-03')
  assert.ok(
    (await check(wrongRoot)).some(
      (p) =>
        p.startsWith(`requirements/core/kinds.md:${wrongLine}: `) &&
        p.includes('wrong area file'),
    ),
  )

  let colText
  const colRoot = await fixture((f) => {
    colText = f['requirements/core/kinds.md'].replace(
      '| 92 | — | T-91-01 |',
      '| 92 | T-91-01 |',
    )
    f['requirements/core/kinds.md'] = colText
  })
  const colLine = lineOf(colText, 'C-KIND-01')
  assert.ok(
    (await check(colRoot)).some(
      (p) =>
        p.startsWith(`requirements/core/kinds.md:${colLine}: `) &&
        p.includes('5 columns'),
    ),
  )

  let badText
  const badRoot = await fixture((f) => {
    badText = f['requirements/core/spots.md'].replace(
      '| C-SPOT-02 |',
      '| C-SPOT-2 |',
    )
    f['requirements/core/spots.md'] = badText
  })
  const badLine = lineOf(badText, 'C-SPOT-2 ')
  assert.ok(
    (await check(badRoot)).some(
      (p) =>
        p.startsWith(`requirements/core/spots.md:${badLine}: `) &&
        p.includes('malformed core ID'),
    ),
  )
})

test('T-30-02 INDEX has the graph, steps table, rules with located files, coverage; deterministic and prettier-clean', async () => {
  assert.deepEqual(parseDepends('23 (steps 24 and 25 …)'), ['23'])
  assert.deepEqual(
    parseDepends(
      '08 (quotas), 13 (members). Activity events have been written since step 04.',
    ),
    ['08', '13'],
  )
  assert.deepEqual(
    parseDepends('04 (role guard). Can be built any time after 04.'),
    ['04'],
  )
  assert.deepEqual(parseDepends('—'), [])

  const root = await fixture()
  const model = loadModel(root)
  const a = await buildIndex(model)
  const b = await buildIndex(loadModel(root))
  assert.equal(a, b)
  assert.ok(await isPrettierClean(a), 'INDEX must be prettier-clean')
  assert.ok(renderIndex(model).length > 0)

  assert.match(a, /^Generated by `pnpm req:build` — do not edit\n/)
  assert.match(a, /```mermaid\nflowchart LR/)
  assert.ok(a.includes('S91 --> S92'))
  assert.ok(a.includes('S92 --> S93'))
  assert.ok(
    !a.includes('S91 --> S93'),
    'text in brackets after 92 must be ignored',
  )
  assert.match(a, /\[Alpha\]\(\.\/91-alpha\.md\)/)
  assert.match(a, /integrated 2026-10-11/)
  assert.match(
    a,
    /\| 93\s+\|.*\| planned\s+\|\s*C-KIND-01/,
    'planned step lists its core change IDs',
  )
  assert.match(
    a,
    /C-SPOT-01.*Creates a spot, e\.g\. via the API\. .*`apps\/api\/src\/alpha\.test\.ts`/,
  )
  assert.ok(!a.includes('Second sentence'), 'only the first sentence is shown')
  assert.ok(!a.includes('<!--'))
  assert.match(a, /\*\*Total\*\*\s+\|\s*3\s+\|\s*3\s+\|\s*0\s+\|\s*1\s+\|/)
  assert.match(a, /not located \(non-manual\): \*\*0\*\*/)
})

test('T-30-03 each rule violation fails --check; a manual T-ID without a tag passes', async () => {
  const has = async (root, needle) => {
    const problems = await check(root)
    assert.ok(
      problems.some((p) => p.includes(needle)),
      `expected "${needle}" in:\n${problems.join('\n')}`,
    )
  }
  const changes = (rows) =>
    `\n## Core changes\n| Core ID | Change | From |\n| --- | --- | --- |\n${rows}\n`

  await has(
    await fixture(
      (f) =>
        (f['requirements/core/kinds.md'] = f[
          'requirements/core/kinds.md'
        ].replace('has a color', 'has a shape')),
      { stale: true },
    ),
    'INDEX.md: is stale',
  )
  await has(
    await fixture(
      (f) =>
        (f['requirements/93-gamma.md'] = step('93', 'Gamma', {
          depends: '92',
          changes: changes('| C-KIND-09 | modify | R-93-01 |'),
        })),
    ),
    'modify C-KIND-09 but it does not exist',
  )
  await has(
    await fixture(
      (f) =>
        (f['requirements/93-gamma.md'] = step('93', 'Gamma', {
          depends: '92',
          changes: changes('| C-KIND-01 | add | R-93-01 |'),
        })),
    ),
    'add C-KIND-01 but it already exists',
  )
  await has(
    await fixture(
      (f) =>
        (f['requirements/93-gamma.md'] = step('93', 'Gamma', {
          depends: '92',
          status: 'integrated 2026-10-12',
          changes: changes('| C-KIND-01 | modify | R-93-01 |'),
        })),
    ),
    'step 93 is integrated but is not in Changed by of C-KIND-01',
  )
  await has(
    await fixture(
      (f) =>
        (f['requirements/core/kinds.md'] = f[
          'requirements/core/kinds.md'
        ].replace('T-91-01', 'T-91-77')),
    ),
    'T-91-77 is not a Definition of Done row',
  )
  await has(
    await fixture(
      (f) =>
        (f['requirements/core/spots.md'] = f[
          'requirements/core/spots.md'
        ].replace('- C-SPOT-02: no test proves it.\n', '')),
    ),
    'C-SPOT-02: active rule has no tests and is not listed under Known gaps',
  )
  await has(
    await fixture((f) => delete f['apps/api/src/alpha.test.ts']),
    'T-91-01 (api) is not located',
  )

  // manual T-91-02 is cited by C-SPOT-01 and has no tag anywhere: valid fixture still passes
  assert.deepEqual(await check(await fixture()), [])

  const bad = await fixture((f) => delete f['apps/api/src/alpha.test.ts'])
  const run = spawnSync(process.execPath, [CLI, '--check', '--root', bad], {
    encoding: 'utf8',
  })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /requirements\/core\/.*\.md:\d+: /)
  const ok = spawnSync(
    process.execPath,
    [CLI, '--check', '--root', await fixture()],
    { encoding: 'utf8' },
  )
  assert.equal(ok.status, 0, ok.stderr)
})

test('T-30-04 every R-ID of steps 00-29 is mapped in core or _unmapped; steps 00-29 have Core, Status, Result', () => {
  const model = loadModel(REPO)
  const old = model.steps.filter((s) => s.num < '30')
  assert.equal(old.length, 30, 'expected steps 00-29')
  const unmapped = new Set(model.unmapped.map((u) => u.rid))
  const missing = []
  for (const s of old) {
    for (const rid of s.rids) {
      const mapped = model.rules.some(
        (r) =>
          r.rids.includes(rid) &&
          (r.since === s.num || r.changedBy.includes(s.num)),
      )
      if (!mapped && !unmapped.has(rid)) missing.push(rid)
    }
  }
  const shown =
    missing.slice(0, 60).join(' ') +
    (missing.length > 60 ? ` … (+${missing.length - 60} more)` : '')
  assert.equal(
    missing.length,
    0,
    `${missing.length} R-IDs are in no core rule (Since/Changed by + source comment) and not in _unmapped.md: ${shown}`,
  )

  const lacking = old.flatMap((s) =>
    [
      s.coreRaw === null && `${s.file}: missing **Core:**`,
      s.statusRaw === null && `${s.file}: missing **Status:**`,
      s.result === null && `${s.file}: missing **Result:**`,
    ].filter(Boolean),
  )
  assert.deepEqual(lacking, [])
})

test('T-30-05 req:check exits 0 on the repo and no non-manual T-ID is unlocated', async () => {
  const run = spawnSync(process.execPath, [CLI, '--check'], {
    encoding: 'utf8',
    cwd: REPO,
  })
  assert.equal(run.status, 0, `req:check failed:\n${run.stderr}`)
  const index = await buildIndex(loadModel(REPO))
  assert.match(index, /not located \(non-manual\): \*\*0\*\*/)
})

test('T-30-09 README links INDEX.md without graph or "23 small steps"; index lists steps 24 and 25 with dependencies', async () => {
  const readme = fs.readFileSync(
    path.join(REPO, 'requirements/README.md'),
    'utf8',
  )
  assert.match(readme, /\]\(\.\/INDEX\.md\)/)
  assert.ok(
    !readme.includes('```mermaid'),
    'README must not contain a mermaid block',
  )
  assert.ok(!readme.includes('23 small steps'))
  const model = loadModel(REPO)
  const index = await buildIndex(model)
  assert.deepEqual(model.stepByNum.get('24')?.depends, ['07', '13', '17', '19'])
  assert.deepEqual(model.stepByNum.get('25')?.depends, ['07'])
  for (const e of [
    'S07 --> S24',
    'S13 --> S24',
    'S17 --> S24',
    'S19 --> S24',
    'S07 --> S25',
  ])
    assert.ok(index.includes(e), `INDEX misses ${e}`)
  assert.match(index, /\[[^\]]*\]\(\.\/24-spot-discussions\.md\)/)
  assert.match(
    index,
    /\[[^\]]*\]\(\.\/25-spot-switching-and-right-click-add\.md\)/,
  )
})
