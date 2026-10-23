import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Buffer } from 'node:buffer'
import { test } from 'node:test'
import { fileURLToPath, URL } from 'node:url'
import { checkLinks, checkReport, screens } from './ui-review/check.mjs'
import { groupResults } from './ui-review/summarize.mjs'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const fixtures = join(root, 'scripts', 'ui-review', 'fixtures')
const summarize = join(root, 'scripts', 'ui-review', 'summarize.mjs')
const validReport = readFileSync(join(fixtures, 'report.txt'), 'utf8')

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'ui-review-test-'))
}

/** A docsDir with findings.json and the two fixture screenshots. */
function docsFixture() {
  const docsDir = tempDir()
  copyFileSync(join(fixtures, 'findings.txt'), join(docsDir, 'findings.json'))
  for (const file of readdirSync(fixtures)) {
    if (file.endsWith('.jpg'))
      copyFileSync(join(fixtures, file), join(docsDir, file))
  }
  return docsDir
}

/** Runs checkReport on a fixture docsDir; `mutate` may change the report text and the directory. */
function check(mutate = (markdown) => markdown) {
  const docsDir = docsFixture()
  try {
    return checkReport(mutate(validReport, docsDir) ?? validReport, {
      root,
      docsDir,
    })
  } finally {
    rmSync(docsDir, { recursive: true, force: true })
  }
}

function assertProblem(found, expected) {
  assert.ok(
    found.some((message) => expected.test(message)),
    `expected a message matching ${expected}, got:\n${found.join('\n') || '(none)'}`,
  )
}

function playwrightList(env, extra = []) {
  const run = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'test', '--list', '--reporter=json', ...extra],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...env, PATH: process.env.PATH, HOME: process.env.HOME },
    },
  )
  assert.equal(run.status, 0, run.stderr)
  const titles = []
  const files = new Set()
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      titles.push(spec.title)
      files.add(spec.file)
    }
    for (const child of suite.suites ?? []) walk(child)
  }
  for (const suite of JSON.parse(run.stdout).suites) walk(suite)
  return { titles, files: [...files] }
}

test('T-40-01 a plain playwright run lists nothing under e2e/ui-review/', () => {
  const { files } = playwrightList({})
  assert.ok(files.length > 0, 'the normal suite is listed')
  assert.deepEqual(
    files.filter((file) => file.includes('ui-review/')),
    [],
  )
})

test('T-40-01 UI_REVIEW=1 lists exactly the 43 tests of the screen list', () => {
  const expected = screens.flatMap((screen) =>
    screen.widths.map((width) => `${screen.id} @ ${width}`),
  )
  assert.equal(expected.length, 43)
  const { titles } = playwrightList({ UI_REVIEW: '1' }, [
    '--project',
    'ui-review',
  ])
  assert.deepEqual(titles, expected)
})

test('T-40-01 the ui:review script runs summarize only after a passing playwright run', () => {
  const script = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    .scripts['ui:review']
  const parts = script.split('&&').map((part) => part.trim())
  assert.equal(parts.length, 2)
  assert.match(parts[0], /^UI_REVIEW=1 playwright test --project ui-review$/)
  assert.equal(parts[1], 'node scripts/ui-review/summarize.mjs')

  const bin = tempDir()
  try {
    const stub = join(bin, 'playwright')
    writeFileSync(stub, '#!/bin/sh\necho "UI_REVIEW=$UI_REVIEW"\nexit 3\n', {
      mode: 0o755,
    })
    const run = spawnSync('sh', ['-c', script], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
    assert.equal(run.status, 3)
    assert.match(run.stdout, /UI_REVIEW=1/)
    assert.doesNotMatch(run.stdout + run.stderr, /No raw results|results in/)
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
})

function result(overrides) {
  return {
    check: 'target-size',
    screen: 'board-map',
    width: 1280,
    theme: 'light',
    locale: 'en',
    name: 'Zoom in',
    selector: '[data-testid="zoom"] button',
    box: { x: 0, y: 0, width: 30, height: 30 },
    ...overrides,
  }
}

test('T-40-03 identical check, screen and selector become one group with four occurrences', () => {
  const results = [
    result({ width: 1280, theme: 'light' }),
    result({ width: 1280, theme: 'dark' }),
    result({ width: 768, theme: 'light' }),
    result({ width: 768, theme: 'dark' }),
    result({ width: 768, theme: 'dark' }),
  ]
  const groups = groupResults(results)
  assert.equal(groups.length, 1)
  assert.equal(
    groups[0].key,
    'target-size/board-map/[data-testid="zoom"] button',
  )
  assert.deepEqual(groups[0].occurrences, [
    '1280-dark',
    '1280-light',
    '768-dark',
    '768-light',
  ])
})

test('T-40-03 groups sort by occurrences, then key; the CLI writes findings.json, summary.md and --docs', () => {
  const dir = tempDir()
  const docsDir = join(tempDir(), 'docs-out')
  try {
    mkdirSync(join(dir, 'raw'))
    writeFileSync(join(dir, 'board-map-1280-light.jpg'), '')
    writeFileSync(join(dir, 'board-map-1280-dark.jpg'), '')
    const four = [
      ['1280', 'light', 'en'],
      ['1280', 'dark', 'en'],
      ['390', 'light', 'en'],
      ['390', 'light', 'de'],
    ].map(([width, theme, locale]) =>
      result({ width: Number(width), theme, locale }),
    )
    const rawFiles = {
      'board-map-1280-light.json': [
        four[0],
        result({ check: 'small-text', selector: 'b', name: 'b' }),
        result({ check: 'overlap', selector: 'a', name: 'a' }),
      ],
      'board-map-1280-dark.json': [four[1]],
      'board-map-390-light.json': [four[2]],
      'board-map-390-light-de.json': [four[3]],
      'login-390-light.json': [],
    }
    for (const [file, results] of Object.entries(rawFiles)) {
      writeFileSync(join(dir, 'raw', file), JSON.stringify(results))
    }
    const run = spawnSync(
      'node',
      [summarize, '--in', dir, '--docs', '--docs-dir', docsDir],
      { cwd: tempDir(), encoding: 'utf8' },
    )
    assert.equal(run.status, 0, run.stderr)

    const findings = JSON.parse(
      readFileSync(join(dir, 'findings.json'), 'utf8'),
    )
    assert.equal(findings.screenshots, 2)
    assert.match(findings.date, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(findings.commit.length > 0)
    assert.deepEqual(
      findings.groups.map((group) => group.key),
      [
        'target-size/board-map/[data-testid="zoom"] button',
        'overlap/board-map/a',
        'small-text/board-map/b',
      ],
    )
    assert.deepEqual(findings.groups[0].occurrences, [
      '1280-dark',
      '1280-light',
      '390-light',
      '390-light-de',
    ])
    assert.equal(findings.groups[0].name, 'Zoom in')

    const summary = readFileSync(join(dir, 'summary.md'), 'utf8')
    assert.match(summary, /target-size: 4/)
    assert.match(summary, /small-text: 1/)
    assert.match(summary, /1280: 4/)
    assert.match(summary, /390: 2/)
    assert.match(
      summary,
      /- target-size\/board-map\/\[data-testid="zoom"\] button — Zoom in — 4× \(1280-dark, 1280-light, 390-light, 390-light-de\)/,
    )
    assert.deepEqual(
      JSON.parse(readFileSync(join(docsDir, 'findings.json'), 'utf8')),
      findings,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(join(docsDir, '..'), { recursive: true, force: true })
  }
})

test('T-40-03 the CLI fails clearly without a raw directory', () => {
  const dir = tempDir()
  try {
    const run = spawnSync('node', [summarize, '--in', dir], {
      encoding: 'utf8',
    })
    assert.notEqual(run.status, 0)
    assert.match(run.stderr, /No raw results/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('T-40-05 the committed report passes every check', () => {
  const report = join(root, 'docs', 'UI_REVIEW.md')
  assert.ok(existsSync(report), 'docs/UI_REVIEW.md exists')
  assert.deepEqual(
    [
      ...checkReport(readFileSync(report, 'utf8'), { root }),
      ...checkLinks(root),
    ],
    [],
  )
})

test('T-40-05 the valid fixture report passes', () => {
  assert.deepEqual(check(), [])
})

test('T-40-05 a missing Mobile section fails', () => {
  const found = check((md) =>
    md.replace(/\n## Mobile\n[\s\S]*?(?=\n## How to repeat)/, ''),
  )
  assertProblem(found, /Missing section "## Mobile"/)
})

test('T-40-05 a section out of order fails', () => {
  const found = check((md) =>
    md
      .replace('## Mobile', '## TMP')
      .replace('## Findings', '## Mobile')
      .replace('## TMP', '## Findings'),
  )
  assertProblem(found, /out of order/)
})

test('T-40-05 rows out of severity order fail', () => {
  const found = check((md) =>
    md
      .replace('| U-01 | high |', '| U-01 | low |')
      .replace('| U-02 | medium |', '| U-02 | high |'),
  )
  assertProblem(found, /Finding U-02: out of sort order/)
})

test('T-40-05 a duplicate ID, a gap, a bad severity and a bad category fail', () => {
  assertProblem(
    check((md) => md.replace('| U-02 | medium', '| U-01 | medium')),
    /Finding U-01: duplicate ID/,
  )
  assertProblem(
    check((md) => md.replaceAll('U-02', 'U-03')),
    /IDs must run U-01\.\.U-NN without gaps, U-02 is missing/,
  )
  assertProblem(
    check((md) => md.replace('| high | mobile |', '| urgent | mobile |')),
    /Finding U-01: invalid severity "urgent"/,
  )
  assertProblem(
    check((md) => md.replace('| high | mobile |', '| high | colour |')),
    /Finding U-01: invalid category "colour"/,
  )
})

test('T-40-05 a table ordered U-02 (high), U-01 (medium) passes', () => {
  const swapped = validReport
    .replaceAll('U-01', 'U-XX')
    .replaceAll('U-02', 'U-01')
    .replaceAll('U-XX', 'U-02')
  assert.ok(
    swapped.indexOf('| U-02 | high') < swapped.indexOf('| U-01 | medium'),
  )
  assert.deepEqual(
    check(() => swapped),
    [],
  )
})

test('T-40-05 IDs out of order within one severity fail', () => {
  const found = check((md) =>
    md
      .replace('| U-01 | high |', '| U-01 | medium |')
      .replace('| U-02 | medium |', '| U-02 | medium |')
      .replace('| U-01 | medium |', '| U-TMP | medium |')
      .replace('| U-02 | medium |', '| U-01 | medium |')
      .replace('| U-TMP | medium |', '| U-02 | medium |'),
  )
  assertProblem(found, /Finding U-01: out of sort order/)
})

test('T-40-05 another Findings column set fails', () => {
  assertProblem(
    check((md) => md.replace('| Suggested fix |', '| Fix |')),
    /Findings table columns must be/,
  )
})

test('T-40-05 a missing cited screenshot fails', () => {
  const found = check((md, docsDir) => {
    rmSync(join(docsDir, 'board-map-390-light.jpg'))
    return md
  })
  assertProblem(
    found,
    /Cited screenshot docs\/ui-review\/board-map-390-light\.jpg does not exist \(U-01\)/,
  )
})

test('T-40-05 a missing screenshot linked only from an Automated findings cell fails', () => {
  const found = check((md) =>
    md.replace(
      'accepted: the fixture page scrolls on purpose',
      'accepted: scrolls on purpose, see [login](ui-review/login-390-light.jpg)',
    ),
  )
  assertProblem(
    found,
    /Cited screenshot docs\/ui-review\/login-390-light\.jpg does not exist \(overflow-x\/login\/html\)/,
  )
})

test('T-40-05 a file cited only by an Automated findings row is not uncited', () => {
  const found = check((md, docsDir) => {
    writeFileSync(join(docsDir, 'login-390-light.jpg'), 'x')
    return md.replace(
      'accepted: the fixture page scrolls on purpose',
      'accepted: scrolls on purpose, see [login](ui-review/login-390-light.jpg)',
    )
  })
  assert.deepEqual(found, [])
})

test('T-40-05 an uncited file fails', () => {
  const found = check((md, docsDir) => {
    writeFileSync(join(docsDir, 'extra.jpg'), 'x')
    return md
  })
  assertProblem(
    found,
    /File docs\/ui-review\/extra\.jpg is not cited by any finding/,
  )
})

test('T-40-05 a 301 kB file fails', () => {
  const found = check((md, docsDir) => {
    writeFileSync(
      join(docsDir, 'schedule-768-dark.jpg'),
      Buffer.alloc(301 * 1024),
    )
    return md
  })
  assertProblem(
    found,
    /File docs\/ui-review\/schedule-768-dark\.jpg is 301 kB, over 300 kB/,
  )
})

test('T-40-05 a group key without a row fails', () => {
  const found = check((md) =>
    md.replace(/^\| `overflow-x\/login\/html`.*\n/m, ''),
  )
  assertProblem(
    found,
    /Group overflow-x\/login\/html of docs\/ui-review\/findings\.json has no Automated findings row/,
  )
})

test('T-40-05 accepted: without a reason fails', () => {
  const found = check((md) =>
    md.replace('accepted: the fixture page scrolls on purpose', 'accepted:'),
  )
  assertProblem(found, /overflow-x\/login\/html: accepted: has no reason/)
})

test('T-40-05 an unknown U- ID fails', () => {
  const found = check((md) =>
    md.replace('| Day 1 | U-02 |', '| Day 1 | U-09 |'),
  )
  assertProblem(
    found,
    /small-text\/schedule.*: U-09 is not in the Findings table/,
  )
  assertProblem(
    check((md) =>
      md.replace('- **Touch targets:** U-01', '- **Touch targets:** U-07'),
    ),
    /Mobile topic "Touch targets": U-07 is not in the Findings table/,
  )
})

test('T-40-05 a missing Mobile topic fails', () => {
  const found = check((md) => md.replace(/^- \*\*Touch targets:\*\*.*\n/m, ''))
  assertProblem(found, /Mobile topic "Touch targets" is missing/)
})

test('T-40-05 a Mobile topic without U- ID or fine: reason fails', () => {
  const found = check((md) =>
    md.replace('- **Touch targets:** U-01', '- **Touch targets:** none'),
  )
  assertProblem(found, /Mobile topic "Touch targets" has no U- ID/)
})

test('T-40-05 a 390 screen in no row and no fine line fails', () => {
  const found = check((md) =>
    md.replace('`not-found`, `admin-dashboard`, ', '`admin-dashboard`, '),
  )
  assertProblem(
    found,
    /Screen "not-found" shown at 390 px is in no Findings row/,
  )
})

test('T-40-05 summary and Screens counts must match findings.json', () => {
  assertProblem(
    check((md) => md.replace('- Commit: abc1234', '- Commit: def5678')),
    /Summary commit def5678 differs from the commit abc1234/,
  )
  assertProblem(
    check((md) => md.replace('- Automated groups: 3', '- Automated groups: 4')),
    /Automated groups is 4, findings\.json says 3/,
  )
  assertProblem(
    check((md) => md.replace('- Screenshots: 101', '- Screenshots: 94')),
    /Screenshots is 94, findings\.json says 101/,
  )
  assertProblem(
    check((md) =>
      md.replace('| `board-map` | 1 | 0 | 1 |', '| `board-map` | 2 | 0 | 1 |'),
    ),
    /Screens: "board-map" at 1280 says 2, findings\.json has 1 groups/,
  )
  assertProblem(
    check((md) =>
      md.replace('| `export` | 0 | 0 | — |', '| `export` | 0 | 0 | 0 |'),
    ),
    /Screens: "export" is not shown at 390/,
  )
  assertProblem(
    check((md) => md.replace(/^\| `trips`.*\n/m, '')),
    /Screens has no row for "trips"/,
  )
})

test('T-40-05 evidence paths and core IDs must exist', () => {
  assertProblem(
    check((md) => md.replace('package.json:1', 'package.json:99999')),
    /line 99999 is past the end of package\.json/,
  )
  assertProblem(
    check((md) => md.replace('package.json:1', 'apps/web/src/nope.tsx:3')),
    /evidence path apps\/web\/src\/nope\.tsx does not exist/,
  )
  assertProblem(
    check((md) => md.replace('C-APP-25', 'C-APP-9999')),
    /core ID C-APP-9999 is not in requirements\/core\//,
  )
})

test('T-40-07 How to repeat without --docs fails', () => {
  const found = check((md) =>
    md.replace('summarize.mjs --docs', 'summarize.mjs'),
  )
  assertProblem(found, /"How to repeat" does not mention --docs/)
})

test('T-40-07 How to repeat without pnpm ui:review fails', () => {
  const found = check((md) => md.replace('`pnpm ui:review`', '`pnpm review`'))
  assertProblem(found, /"How to repeat" does not mention pnpm ui:review/)
})

test('T-40-07 README lists pnpm ui:review and DESIGN.md links UI_REVIEW.md', () => {
  assert.deepEqual(checkLinks(root), [])
})
