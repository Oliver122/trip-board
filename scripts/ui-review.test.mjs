import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
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
import {
  checkBrief,
  checkNote,
  checkNotes,
  imageNames,
  parseImage,
} from './ui-review/notes.mjs'
import { orderImages, stubFor } from './ui-review/queue.mjs'
import { checkSketch, checkSketchLinks } from './ui-review/sketch.mjs'
import {
  buildPanel,
  findingsTable,
  implementationSets,
} from './ui-review/changes.mjs'
import { groupResults } from './ui-review/summarize.mjs'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const fixtures = join(root, 'scripts', 'ui-review', 'fixtures')
const summarize = join(root, 'scripts', 'ui-review', 'summarize.mjs')
const queue = join(root, 'scripts', 'ui-review', 'queue.mjs')
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
    'e2e/ui-review/capture.spec.ts',
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
  assert.match(
    parts[0],
    /^UI_REVIEW=1 playwright test e2e\/ui-review\/capture\.spec\.ts --project ui-review$/,
  )
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

// Step 41: per-screenshot review notes and the phone sketch.

test('T-41-01 the image names are the 101 of the screen list, in order', () => {
  const names = imageNames()
  assert.equal(names.length, 101)
  assert.equal(new Set(names).size, 101)
  assert.deepEqual(names.slice(0, 7), [
    'login-1280-light',
    'login-1280-dark',
    'login-768-light',
    'login-768-dark',
    'login-390-light',
    'login-390-dark',
    'login-390-light-de',
  ])
  for (const name of names) assert.notEqual(parseImage(name), null, name)
  assert.deepEqual(parseImage('board-map-390-light-de'), {
    screen: 'board-map',
    width: 390,
    theme: 'light',
    locale: 'de',
  })
  for (const bad of [
    'board-map-640-light',
    'unknown-390-dark',
    'export-390-light',
    'board-list-1280-light',
    'login-768-light-de',
    'login-390-dark-de',
  ]) {
    assert.equal(parseImage(bad), null, bad)
  }
})

test('T-41-01 queue.mjs prints the images in order and writes stubs without overwriting', () => {
  const dir = tempDir()
  const notes = join(tempDir(), 'notes')
  try {
    for (const name of [
      'login-390-light-de',
      'trips-1280-dark',
      'login-1280-light',
      'login-390-light',
      'login-1280-dark',
      'login-768-light',
    ]) {
      writeFileSync(join(dir, `${name}.jpg`), '')
    }
    const expected = [
      'login-1280-light',
      'login-1280-dark',
      'login-768-light',
      'login-390-light',
      'login-390-light-de',
      'trips-1280-dark',
    ]
    const run = spawnSync('node', [queue, dir, '--notes', notes], {
      encoding: 'utf8',
    })
    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(run.stdout.trim().split('\n'), expected)
    assert.deepEqual(
      readdirSync(notes).sort(),
      expected.map((name) => `${name}.md`).sort(),
    )
    assert.equal(
      readFileSync(join(notes, 'login-390-light-de.md'), 'utf8'),
      stubFor('login-390-light-de'),
    )
    assert.match(
      readFileSync(join(notes, 'login-390-light-de.md'), 'utf8'),
      /- Width: 390\n- Theme: light\n- Locale: de\n/,
    )

    writeFileSync(join(notes, 'login-390-light.md'), 'edited by a reviewer\n')
    const again = spawnSync('node', [queue, dir, '--notes', notes], {
      encoding: 'utf8',
    })
    assert.equal(again.status, 0, again.stderr)
    assert.equal(
      readFileSync(join(notes, 'login-390-light.md'), 'utf8'),
      'edited by a reviewer\n',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(join(notes, '..'), { recursive: true, force: true })
  }
})

test('T-41-01 queue.mjs names every bad file, creates nothing and exits 1', () => {
  const dir = tempDir()
  const notes = join(tempDir(), 'notes')
  try {
    for (const file of [
      'board-640-light.jpg',
      'unknown-390-dark.jpg',
      'login-390-light.jpg',
    ]) {
      writeFileSync(join(dir, file), '')
    }
    const run = spawnSync('node', [queue, dir, '--notes', notes], {
      encoding: 'utf8',
    })
    assert.equal(run.status, 1)
    assert.match(
      run.stderr,
      /board-640-light\.jpg: not <screen>-<width>-<light\|dark>\[-de\]\.jpg for a known screen and width/,
    )
    assert.match(run.stderr, /unknown-390-dark\.jpg: not /)
    assert.doesNotMatch(run.stderr, /login-390-light/)
    assert.equal(existsSync(notes), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(join(notes, '..'), { recursive: true, force: true })
  }
})

test('T-41-01 orderImages splits valid names from invalid files', () => {
  assert.deepEqual(
    orderImages(['trips-1280-light.jpg', 'x.jpg', 'login-390-dark.jpg']),
    {
      ordered: ['login-390-dark', 'trips-1280-light'],
      invalid: ['x.jpg'],
    },
  )
})

test('T-41-01 a stub fails the note check because Seen has no bullets', () => {
  const found = checkNote('board-map-390-light', stubFor('board-map-390-light'))
  assertProblem(found, /Seen has 0 bullets, it needs 3 to 8/)
})

const seenBullets = '- The title\n- The main control\n- The data'

function noteText(name, problems = 'None.', raw = 'None.') {
  const image = parseImage(name)
  return `# ${name}

- Screen: ${image.screen}
- Width: ${image.width}
- Theme: ${image.theme}
- Locale: ${image.locale}

## Seen

${seenBullets}

## Problems

${problems}

## Raw checks

${raw}
`
}

const problemTable = (known, severity = 'medium') =>
  `| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | ${severity} | touch | Zoom buttons are small | bottom right, above the tab bar | ${known} |`

const specialNotes = {
  'board-map-390-light': noteText(
    'board-map-390-light',
    problemTable('U-01'),
    '- `target-size` Zoom in (`div.flex > button`) → U-01',
  ),
  'schedule-768-dark': noteText(
    'schedule-768-dark',
    problemTable('U-02', 'low'),
    '- `small-text` Day 1 (`span.day`) → U-02',
  ),
  'login-390-light': noteText(
    'login-390-light',
    problemTable('rejected: the credit is meant to be small', 'low'),
    '- `small-text` OpenFreeMap (`p.absolute > a`) → accepted: credit line',
  ),
}

/** A temp directory with all 101 valid notes and a report that cites and counts them. */
function notesFixture() {
  const dir = tempDir()
  const notesDir = join(dir, 'notes')
  mkdirSync(notesDir)
  for (const name of imageNames()) {
    writeFileSync(
      join(notesDir, `${name}.md`),
      specialNotes[name] ?? noteText(name),
    )
  }
  const reportNotes = readFileSync(join(fixtures, 'report-notes.txt'), 'utf8')
  const markdown = validReport
    .replace(
      '(ui-review/schedule-768-dark.jpg)',
      '(ui-review/schedule-768-dark.jpg), docs/ui-review/notes/schedule-768-dark.md',
    )
    .replace('## How to repeat', `${reportNotes}## How to repeat`)
    .replace(
      /(## How to repeat\n.*)$/s,
      '$1 List the images with `node scripts/ui-review/queue.mjs`, brief one worker per image and check the notes with `node scripts/ui-review/notes.mjs`.',
    )
  return { dir, notesDir, markdown }
}

function editNote(fixture, name, change) {
  const file = join(fixture.notesDir, `${name}.md`)
  writeFileSync(file, change(readFileSync(file, 'utf8')))
}

/** Runs checkNotes on a fixture; `mutate` may change the notes and return a new report. */
function checkFixtureNotes(mutate = () => {}) {
  const fixture = notesFixture()
  try {
    const markdown = mutate(fixture) ?? fixture.markdown
    return checkNotes({ notesDir: fixture.notesDir, markdown, root })
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true })
  }
}

test('T-41-02 notes.mjs passes on the committed notes', () => {
  assert.deepEqual(
    checkNotes({
      notesDir: join(root, 'docs', 'ui-review', 'notes'),
      markdown: readFileSync(join(root, 'docs', 'UI_REVIEW.md'), 'utf8'),
      root,
    }),
    [],
  )
})

test('T-41-02 the valid fixture notes and report pass', () => {
  assert.deepEqual(checkFixtureNotes(), [])
})

test('T-41-02 a missing note and an extra note fail', () => {
  assertProblem(
    checkFixtureNotes((f) => rmSync(join(f.notesDir, 'trips-1280-dark.md'))),
    /docs\/ui-review\/notes\/trips-1280-dark\.md: missing/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      writeFileSync(join(f.notesDir, 'export-390-light.md'), 'x'),
    ),
    /docs\/ui-review\/notes\/export-390-light\.md: is not a screenshot of the screen list/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      writeFileSync(join(f.notesDir, 'login-390-light.txt'), 'x'),
    ),
    /login-390-light\.txt: is not a screenshot of the screen list/,
  )
  assert.deepEqual(
    checkFixtureNotes((f) =>
      writeFileSync(join(f.notesDir, '_BRIEF.md'), 'ignored'),
    ),
    [],
  )
})

test('T-41-02 a note that breaks the format fails with a message naming it', () => {
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'trips-1280-light', (md) => md.replace('- The data', '')),
    ),
    /notes\/trips-1280-light\.md: Seen has 2 bullets, it needs 3 to 8/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'trips-1280-light', (md) =>
        md.replace(
          seenBullets,
          `${seenBullets}\n`.repeat(1) + '- a\n- b\n- c\n- d\n- e\n- f',
        ),
      ),
    ),
    /trips-1280-light\.md: Seen has 9 bullets/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'trips-1280-light', (md) =>
        md
          .replace('## Problems', '## TMP')
          .replace('## Raw checks', '## Problems')
          .replace('## TMP', '## Raw checks'),
      ),
    ),
    /trips-1280-light\.md: section "## Raw checks" is out of order/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'trips-390-light', (md) =>
        md.replace('- Width: 390', '- Width: 768'),
      ),
    ),
    /trips-390-light\.md: header line 2 must be "- Width: 390", found "- Width: 768"/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'trips-390-light', (md) =>
        md.replace('# trips-390-light', '# trips'),
      ),
    ),
    /trips-390-light\.md: first line must be "# trips-390-light"/,
  )
})

test('T-41-02 a bad severity, category or problem table fails', () => {
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'board-map-390-light', (md) =>
        md.replace('| medium |', '| urgent |'),
      ),
    ),
    /board-map-390-light\.md: problem 1: invalid severity "urgent"/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'board-map-390-light', (md) =>
        md.replace('| touch |', '| colour |'),
      ),
    ),
    /problem 1: invalid category "colour"/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'board-map-390-light', (md) => md.replace('| 1 |', '| 2 |')),
    ),
    /problem 1: # must be 1/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'board-map-390-light', (md) =>
        md.replace('| Where |', '| Place |'),
      ),
    ),
    /Problems table columns must be: #, Severity, Category, Issue, Where, Known/,
  )
})

test('T-41-02 Known = new, an unknown U- ID or rejected: without a reason fails', () => {
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'board-map-390-light', (md) =>
        md.replace('| U-01 |', '| new |'),
      ),
    ),
    /board-map-390-light\.md: Known is "new" in problem 1; replace it with the U- ID it became or rejected: <reason>/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'board-map-390-light', (md) =>
        md.replace('| U-01 |', '| U-99 |'),
      ),
    ),
    /board-map-390-light\.md: Known in problem 1: U-99 is not in docs\/UI_REVIEW\.md Findings/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'login-390-light', (md) =>
        md.replace('rejected: the credit is meant to be small', 'rejected:'),
      ),
    ),
    /login-390-light\.md: Known "rejected:" in problem 1 has no reason/,
  )
})

test('T-41-02 Raw checks lines need an outcome', () => {
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'board-map-390-light', (md) =>
        md.replace('→ U-01', '→ later'),
      ),
    ),
    /board-map-390-light\.md: Raw checks line 1 must be a bullet ending in/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'board-map-390-light', (md) => md.replace('→ U-01', '→ new')),
    ),
    /board-map-390-light\.md: Raw checks line 1 ends in → new/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'board-map-390-light', (md) =>
        md.replace('→ U-01', '→ U-98'),
      ),
    ),
    /Raw checks line 1: U-98 is not in docs\/UI_REVIEW\.md Findings/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      editNote(f, 'login-390-light', (md) =>
        md.replace('→ accepted: credit line', '→ accepted:'),
      ),
    ),
    /login-390-light\.md: Raw checks line 1 must be a bullet/,
  )
})

test('T-41-02 checkNote allows new while a reviewer works, but not an unknown U- ID', () => {
  const findingIds = new Set(['U-01'])
  const text = noteText(
    'board-map-390-light',
    problemTable('new'),
    '- `target-size` Zoom in (`button`) → new',
  )
  assert.deepEqual(
    checkNote('board-map-390-light', text, { findingIds, allowNew: true }),
    [],
  )
  assert.equal(checkNote('board-map-390-light', text, { findingIds }).length, 2)
  assertProblem(
    checkNote('board-map-390-light', text.replaceAll('new', 'U-77'), {
      findingIds,
      allowNew: true,
    }),
    /U-77 is not in docs\/UI_REVIEW\.md Findings/,
  )
})

test('T-41-02 the committed brief has {{image}} and a row for every screen', () => {
  const brief = join(root, 'docs', 'ui-review', 'notes', '_BRIEF.md')
  assert.ok(existsSync(brief), 'docs/ui-review/notes/_BRIEF.md exists')
  assert.deepEqual(checkBrief(readFileSync(brief, 'utf8')), [])
})

test('T-41-02 a brief without {{image}} or without a screen row fails', () => {
  const brief = [
    'Read test-results/ui-review/{{image}}.jpg only.',
    '',
    '| Screen | Section | Core rules |',
    '| --- | --- | --- |',
    ...screens.map((screen) => `| \`${screen.id}\` | §3.1 | C-APP-25 |`),
  ].join('\n')
  assert.deepEqual(checkBrief(brief), [])
  assertProblem(
    checkBrief(brief.replace('{{image}}', '<image>')),
    /_BRIEF\.md: does not contain \{\{image\}\}/,
  )
  assertProblem(
    checkBrief(brief.replace(/^\| `more-sheet`.*\n/m, '')),
    /_BRIEF\.md: has no table row for `more-sheet`/,
  )
})

test('T-41-03 the committed report passes check.mjs and notes.mjs', () => {
  const markdown = readFileSync(join(root, 'docs', 'UI_REVIEW.md'), 'utf8')
  assert.deepEqual(
    [
      ...checkReport(markdown, { root }),
      ...checkLinks(root),
      ...checkNotes({
        notesDir: join(root, 'docs', 'ui-review', 'notes'),
        markdown,
        root,
      }),
    ],
    [],
  )
})

test('T-41-03 the fixture report with notes passes check.mjs too', () => {
  const fixture = notesFixture()
  const docsDir = docsFixture()
  try {
    mkdirSync(join(docsDir, 'notes'))
    assert.deepEqual(checkReport(fixture.markdown, { root, docsDir }), [])
    const swapped = fixture.markdown
      .replace('| U-01 | high |', '| U-01 | low |')
      .replace('| U-02 | medium |', '| U-02 | high |')
    assertProblem(
      checkReport(swapped, { root, docsDir }),
      /Finding U-02: out of sort order/,
    )
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true })
    rmSync(docsDir, { recursive: true, force: true })
  }
})

test('T-41-03 a report without Review notes, or with it after How to repeat, fails', () => {
  assertProblem(
    checkFixtureNotes((f) =>
      f.markdown.replace(/## Review notes\n[\s\S]*?(?=## How to repeat)/, ''),
    ),
    /Missing section "## Review notes"/,
  )
  assertProblem(
    checkFixtureNotes((f) => {
      const section = /## Review notes\n[\s\S]*?(?=## How to repeat)/.exec(
        f.markdown,
      )[0]
      return `${f.markdown.replace(section, '').trimEnd()}\n\n${section}`
    }),
    /Section "## Review notes" must be between Mobile and How to repeat/,
  )
})

test('T-41-03 the Review notes counts must match the notes', () => {
  assertProblem(
    checkFixtureNotes((f) =>
      f.markdown.replace('- Problems: 3', '- Problems: 4'),
    ),
    /Review notes line "- Problems" says 4, the notes give 3/,
  )
  assertProblem(
    checkFixtureNotes((f) => f.markdown.replace('- New U-: 1', '- New U-: 0')),
    /Review notes line "- New U-" says 0, the notes give 1/,
  )
  assertProblem(
    checkFixtureNotes((f) =>
      f.markdown.replace('- Notes: 101', '- Notes: 100'),
    ),
    /Review notes line "- Notes" says 100, the notes give 101/,
  )
  assertProblem(
    checkFixtureNotes((f) => f.markdown.replace(/^- Run:.*\n/m, '')),
    /Review notes line "- Run: <text>" is missing or empty/,
  )
})

test('T-41-03 a row with no citing note needs a Review notes line', () => {
  assertProblem(
    checkFixtureNotes((f) => f.markdown.replace(/^- U-01: confirmed.*\n/m, '')),
    /Finding U-01 has no line in Review notes and no note cites it/,
  )
  assert.deepEqual(
    checkFixtureNotes((f) =>
      f.markdown.replace(
        /^- U-01: confirmed.*$/m,
        '- U-01: not seen: fixed by the capture of this run',
      ),
    ),
    [],
  )
  assertProblem(
    checkFixtureNotes((f) =>
      f.markdown.replace(
        'confirmed in docs/ui-review/notes/board-map-390-light.md',
        'confirmed in docs/ui-review/notes/not-there.md',
      ),
    ),
    /U-01 is confirmed in docs\/ui-review\/notes\/not-there\.md, which does not exist/,
  )
})

test('T-41-03 on a copy of the committed report and notes, U-05 without a line and a new Known fail', () => {
  const markdown = readFileSync(join(root, 'docs', 'UI_REVIEW.md'), 'utf8')
  const notesDir = tempDir()
  try {
    const source = join(root, 'docs', 'ui-review', 'notes')
    for (const file of readdirSync(source)) {
      copyFileSync(join(source, file), join(notesDir, file))
    }
    assertProblem(
      checkNotes({
        notesDir,
        markdown: markdown.replace(/^- U-05: .*\n/m, ''),
        root,
      }),
      /Finding U-05 has no line in Review notes and no note cites it/,
    )
    const note = join(notesDir, 'schedule-390-light.md')
    writeFileSync(
      note,
      readFileSync(note, 'utf8').replace(/\| U-05 \|$/m, '| new |'),
    )
    assertProblem(
      checkNotes({ notesDir, markdown, root }),
      /schedule-390-light\.md: Known is "new"/,
    )
  } finally {
    rmSync(notesDir, { recursive: true, force: true })
  }
})

test('T-41-03 a row citing a note that does not exist fails', () => {
  const row =
    '| U-03 | low | text | `schedule` | 768 | Another | [x](ui-review/schedule-768-dark.jpg), docs/ui-review/notes/not-there.md | Fix | — |\n'
  assertProblem(
    checkFixtureNotes((f) =>
      f.markdown.replace(/^(\| U-02 \|.*\n)/m, `$1${row}`),
    ),
    /Finding U-03: cited note docs\/ui-review\/notes\/not-there\.md does not exist/,
  )
  const link = row.replace(
    'docs/ui-review/notes/not-there.md',
    '[n](ui-review/notes/not-there.md)',
  )
  assertProblem(
    checkFixtureNotes((f) =>
      f.markdown.replace(/^(\| U-02 \|.*\n)/m, `$1${link}`),
    ),
    /Finding U-03: cited note docs\/ui-review\/notes\/not-there\.md does not exist/,
  )
  const noJpg = row.replace('[x](ui-review/schedule-768-dark.jpg), ', '')
  assertProblem(
    checkFixtureNotes((f) =>
      f.markdown
        .replace(/^(\| U-02 \|.*\n)/m, `$1${noJpg}`)
        .replace(
          'docs/ui-review/notes/not-there.md',
          'docs/ui-review/notes/login-390-light.md',
        ),
    ),
    /Finding U-03: cites a note but no screenshot/,
  )
})

test('T-41-03 How to repeat must name queue.mjs and notes.mjs', () => {
  assertProblem(
    checkFixtureNotes((f) => f.markdown.replace('queue.mjs', 'queue')),
    /"How to repeat" does not mention queue\.mjs/,
  )
  assertProblem(
    checkFixtureNotes((f) => f.markdown.replace('notes.mjs', 'notes')),
    /"How to repeat" does not mention notes\.mjs/,
  )
})

test('T-41-03 notes.mjs --note checks one note and allows new', () => {
  const notes = join(root, 'docs', 'ui-review', 'notes')
  const script = join(root, 'scripts', 'ui-review', 'notes.mjs')
  const missing = spawnSync('node', [script, '--note', 'no-such-image'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /no-such-image\.md: missing/)
  if (existsSync(join(notes, 'login-390-light.md'))) {
    const run = spawnSync('node', [script, '--note', 'login-390-light'], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.match(run.stdout + run.stderr, /login-390-light\.md/)
  }
})

// The sketch fixtures: a temp root with the 15 notes the sketch links, the de locale and the core rules.
const sketchText = readFileSync(join(fixtures, 'sketch.txt'), 'utf8')
const sketchReport = validReport.replace(
  '| `schedule` | 768 |',
  '| `schedule` | 768, 390 |',
)

function sketchRoot() {
  const dir = tempDir()
  const notes = join(dir, 'docs', 'ui-review', 'notes')
  mkdirSync(notes, { recursive: true })
  for (const screen of screens.filter((entry) => entry.widths.includes(390))) {
    writeFileSync(join(notes, `${screen.id}-390-light.md`), '')
  }
  const locales = join(dir, 'apps', 'web', 'src', 'locales', 'de')
  mkdirSync(locales, { recursive: true })
  copyFileSync(
    join(root, 'apps', 'web', 'src', 'locales', 'de', 'common.json'),
    join(locales, 'common.json'),
  )
  cpSync(
    join(root, 'requirements', 'core'),
    join(dir, 'requirements', 'core'),
    {
      recursive: true,
    },
  )
  return dir
}

/** Runs checkSketch on the fixture; `mutate` returns the sketch text, or `{ sketch, report }`. */
function checkFixtureSketch(mutate = (text) => text) {
  const dir = sketchRoot()
  try {
    const changed = mutate(sketchText)
    const sketch = typeof changed === 'string' ? changed : changed.sketch
    const reportMarkdown =
      typeof changed === 'string' ? sketchReport : changed.report
    return checkSketch(sketch, { root: dir, reportMarkdown })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const wideFrame = (columns) => `┌${'─'.repeat(columns - 2)}┐`

test('T-41-04 the committed sketch passes', () => {
  assert.deepEqual(
    checkSketch(readFileSync(join(root, 'docs', 'MOBILE_SKETCH.md'), 'utf8'), {
      root,
      reportMarkdown: readFileSync(join(root, 'docs', 'UI_REVIEW.md'), 'utf8'),
    }),
    [],
  )
})

test('T-41-04 docs/DESIGN.md links MOBILE_SKETCH.md', () => {
  assert.deepEqual(checkSketchLinks(root), [])
})

test('T-41-04 checkSketchLinks needs a link, not a mention', () => {
  const dir = tempDir()
  try {
    mkdirSync(join(dir, 'docs'))
    writeFileSync(join(dir, 'docs', 'DESIGN.md'), 'See MOBILE_SKETCH.md.\n')
    assertProblem(
      checkSketchLinks(dir),
      /docs\/DESIGN\.md does not link MOBILE_SKETCH\.md/,
    )
    writeFileSync(
      join(dir, 'docs', 'DESIGN.md'),
      'See [the sketch](MOBILE_SKETCH.md).\n',
    )
    assert.deepEqual(checkSketchLinks(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('T-41-04 the valid fixture sketch passes', () => {
  assert.deepEqual(checkFixtureSketch(), [])
})

test('T-41-04 sections out of order, a missing screen and a missing field fail', () => {
  assertProblem(
    checkFixtureSketch((text) => {
      const [pre, rest] = text.split('## Shared parts\n')
      const [shared, rest2] = rest.split('## Screens\n')
      const [screensPart, set] = rest2.split('## Implementation set\n')
      return `${pre}## Screens\n${screensPart}## Shared parts\n${shared}## Implementation set\n${set}`
    }),
    /Section "## Screens" is out of order/,
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text.replace(/### more-sheet\n[\s\S]*?(?=### account)/, ''),
    ),
    /Screen "more-sheet" is missing/,
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text.replace(/### Dialog\n[\s\S]*?(?=### Buttons)/, ''),
    ),
    /Shared part "Dialog" is missing/,
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text
        .replace('### login\n', '### login\n')
        .replace(/(### trips\n)/, '### zzz\n$1'),
    ),
    /Screen "zzz" is not in the list/,
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text
        .replace(/### trips\n[\s\S]*?(?=### board-map)/, '')
        .replace('### login', '### trips\nToday: x\n### login'),
    ),
    /Screen "trips"/,
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text.replace(/^Longest German label: "Erneut versuchen"\n/m, ''),
    ),
    /Screen "schedule" has no Longest German label:/,
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text.replace('"Erneut versuchen"', '"Zzz nicht da"'),
    ),
    /Screen "schedule": Longest German label "Zzz nicht da" is not in apps\/web\/src\/locales\/de\/common\.json/,
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text.replace(
        '(ui-review/notes/members-390-light.md)',
        '(ui-review/notes/nope.md)',
      ),
    ),
    /Screen "members": Today: must link ui-review\/notes\/members-390-light\.md/,
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text.replace(
        /Changes:\n- .*\n(?=Longest German label: "Dev-Anmeldung")/,
        'Changes:\n',
      ),
    ),
    /Screen "admin-users": Changes: has no bullets/,
  )
  assertProblem(
    checkFixtureSketch((text) => text.replace('C-APP-35', 'C-APP-3')),
    /Principles do not name C-APP-35/,
  )
})

test('T-41-04 a Today link needs the note to exist', () => {
  const dir = sketchRoot()
  try {
    rmSync(join(dir, 'docs', 'ui-review', 'notes', 'account-390-light.md'))
    assertProblem(
      checkSketch(sketchText, { root: dir, reportMarkdown: sketchReport }),
      /Screen "account": Today: docs\/ui-review\/notes\/account-390-light\.md does not exist/,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('T-41-04 a wireframe 40 columns wide or 51 lines long fails', () => {
  assertProblem(
    checkFixtureSketch((text) =>
      text.replace(
        /(### board-map\nToday:.*\n```\n)[^\n]*\n/,
        `$1${wideFrame(40)}\n`,
      ),
    ),
    /Screen "board-map" wireframe is 40 columns wide, the frame must be 36/,
  )
  const blank = `│${' '.repeat(34)}│`
  assertProblem(
    checkFixtureSketch((text) =>
      text.replace(
        /(### board-map\nToday:.*\n```\n)[\s\S]*?(\n```)/,
        `$1${[wideFrame(36), ...Array(50).fill(blank)].join('\n')}$2`,
      ),
    ),
    /Screen "board-map" wireframe has 51 lines, at most 50/,
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text.replace(/(### Dialog\n```\n[^\n]*\n)/, `$1│ ${'x'.repeat(40)} │\n`),
    ),
    /Shared part "Dialog" wireframe line 2 is 44 columns, at most 36/,
  )
})

test('T-41-04 Fixes: naming a U- ID that is not in Findings fails', () => {
  assertProblem(
    checkFixtureSketch((text) => text.replace('Fixes: U-02', 'Fixes: U-99')),
    /Screen "schedule": Fixes: U-99 is not in docs\/UI_REVIEW\.md Findings/,
  )
  assertProblem(
    checkFixtureSketch((text) => text.replace('Fixes: U-02', 'Fixes: soon')),
    /Screen "schedule": Fixes: "soon" must be U- IDs or —/,
  )
})

test('T-41-04 a 390 px row must be in exactly one set or later: line', () => {
  assertProblem(
    checkFixtureSketch((text) =>
      text.replace('| U-01 | `board-map`', '| U-01, U-02 | `board-map`'),
    ),
    /U-02 is in S-01 and S-02/,
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text.replace('| Day label size | U-02 |', '| Day label size | — |'),
    ),
    /U-02 \(390 px\) is in no set and no later: line/,
  )
  assert.deepEqual(
    checkFixtureSketch((text) =>
      text
        .replace('| Day label size | U-02 |', '| Day label size | — |')
        .concat('later: U-02 only seen in the schedule at 768\n'),
    ),
    [],
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text
        .replace('| Day label size | U-02 |', '| Day label size | — |')
        .concat('later: U-02\n'),
    ),
    /later: U-02 has no reason/,
  )
  assertProblem(
    checkFixtureSketch((text) => text.concat('later: U-01 not now\n')),
    /U-01 is in S-01 and a later: line/,
  )
})

test('T-41-04 a set with 7 U- IDs, a bad core rule, bad order or bad columns fails', () => {
  const extra = [3, 4, 5, 6, 7, 8]
    .map(
      (n) =>
        `| U-0${n} | low | text | \`schedule\` | 390 | Extra ${n} | [x](ui-review/x.jpg) | Fix | — |\n`,
    )
    .join('')
  assertProblem(
    checkFixtureSketch((text) => ({
      sketch: text.replace(
        '| U-01 | `board-map`',
        '| U-01, U-03, U-04, U-05, U-06, U-07, U-08 | `board-map`',
      ),
      report: sketchReport.replace(/^(\| U-02 \|.*\n)/m, `$1${extra}`),
    })),
    /Set S-01 has 7 U- IDs, at most 6/,
  )
  assertProblem(
    checkFixtureSketch((text) => text.replace('| C-APP-25 |', '| C-APP-99 |')),
    /Set S-01: core ID C-APP-99 is not in requirements\/core\//,
  )
  assertProblem(
    checkFixtureSketch((text) => text.replace('| S-01 |', '| S-02 |')),
    /Set IDs must run S-01, S-02, … without gaps/,
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text
        .replace('| S-01 |\n', '| S-01 |\n')
        .replace('| — | S-01 |', '| — | S-03 |'),
    ),
    /Set S-02: Depends on "S-03" must be an earlier set/,
  )
  assertProblem(
    checkFixtureSketch((text) =>
      text
        .replace('| U-01 | `board-map`', '| U-02 | `board-map`')
        .replace('| U-02 | `schedule`', '| U-01 | `schedule`'),
    ),
    /Set S-02: highest severity high comes after S-01 with medium/,
  )
  assertProblem(
    checkFixtureSketch((text) => text.replace('| Depends on |', '| After |')),
    /Implementation set columns must be: Set, Title, U- IDs, Screens, Core rules, Depends on/,
  )
})

// Step 42: the change panel (changes.mjs) and the refreshed report

const changesCli = join(root, 'scripts', 'ui-review', 'changes.mjs')
const reportText = readFileSync(join(root, 'docs', 'UI_REVIEW.md'), 'utf8')
const realSketch = readFileSync(join(root, 'docs', 'MOBILE_SKETCH.md'), 'utf8')
const reportRows = findingsTable(reportText)
const sketchSets = implementationSets(realSketch)

/** A manifest with one entry per U- ID of S-01..S-08; images are 390 where the row has it. */
function fixtureManifest() {
  const changes = sketchSets.flatMap((set) =>
    set.ids.map((id) => {
      const row = reportRows.find((entry) => entry.id === id)
      const width = row.widths.includes('390') ? 390 : row.widths[0]
      return {
        id,
        set: set.set,
        done: `Fixed ${id}.`,
        files: ['package.json'],
        images: [`${row.screens[0]}-${width}-light`],
      }
    }),
  )
  return { step: 42, base: 'abc1234', changes }
}

/** Before and after dirs holding a stub JPEG for every image the manifest cites. */
function changesFixture(manifest) {
  const dir = tempDir()
  for (const side of ['before', 'after']) {
    mkdirSync(join(dir, side), { recursive: true })
    writeFileSync(
      join(dir, side, 'findings.json'),
      JSON.stringify({ commit: `${side}01`, groups: [] }),
    )
    for (const change of manifest.changes) {
      for (const image of change.images) {
        writeFileSync(
          join(dir, side, `${image}.jpg`),
          Buffer.from([0xff, 0xd8]),
        )
      }
    }
  }
  return dir
}

function runChanges(dir, manifest) {
  const manifestPath = join(dir, 'changes.json')
  writeFileSync(manifestPath, JSON.stringify(manifest))
  const run = spawnSync(
    'node',
    [
      changesCli,
      '--before',
      join(dir, 'before'),
      '--after',
      join(dir, 'after'),
      '--manifest',
      manifestPath,
      '--out',
      join(dir, 'out'),
    ],
    { cwd: root, encoding: 'utf8' },
  )
  return { ...run, out: join(dir, 'out') }
}

test('T-42-01 changes.mjs passes on the committed manifest with fixture captures', () => {
  const file = join(root, 'docs', 'ui-review', 'changes-42.json')
  assert.ok(existsSync(file), 'docs/ui-review/changes-42.json exists')
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  const dir = changesFixture(manifest)
  try {
    const run = runChanges(dir, manifest)
    assert.equal(run.status, 0, run.stderr)
    assert.ok(existsSync(join(run.out, 'index.html')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('T-42-01 changes.mjs fails and writes nothing on a broken manifest', () => {
  const base = fixtureManifest()
  assert.equal(base.changes.length, 29)
  const clone = () => JSON.parse(JSON.stringify(base))
  const cases = [
    [
      /U-99: not in Findings/,
      (m) => m.changes.push({ ...m.changes[0], id: 'U-99' }),
    ],
    [/U-07: in no set/, (m) => m.changes.push({ ...m.changes[0], id: 'U-07' })],
    [
      /U-02: set is S-03/,
      (m) => {
        m.changes.find((c) => c.id === 'U-02').set = 'S-03'
      },
    ],
    [
      /U-03: no entry/,
      (m) => {
        m.changes = m.changes.filter((c) => c.id !== 'U-03')
      },
    ],
    [
      /U-24: 2 entries/,
      (m) => m.changes.push({ ...m.changes.find((c) => c.id === 'U-24') }),
    ],
    [
      /U-02: file no\/such\/file\.ts does not exist/,
      (m) => {
        m.changes.find((c) => c.id === 'U-02').files = ['no/such/file.ts']
      },
    ],
    [
      /U-02: .* is missing in .*after/,
      (m, dir) => rmSync(join(dir, 'after', 'board-map-390-light.jpg')),
    ],
    [
      /U-02: "images" must have 1 to 6 names/,
      (m) => {
        m.changes.find((c) => c.id === 'U-02').images = Array(7).fill(
          'board-map-390-light',
        )
      },
    ],
    [
      /U-02: no image at 390/,
      (m, dir) => {
        m.changes.find((c) => c.id === 'U-02').images = ['board-map-1280-light']
        for (const side of ['before', 'after'])
          writeFileSync(join(dir, side, 'board-map-1280-light.jpg'), 'x')
      },
    ],
  ]
  for (const [expected, mutate] of cases) {
    const manifest = clone()
    const dir = changesFixture(manifest)
    try {
      mutate(manifest, dir)
      const run = runChanges(dir, manifest)
      assert.equal(run.status, 1, `${expected}: exit status`)
      assert.match(run.stderr, expected)
      assert.equal(existsSync(run.out), false, `${expected}: nothing written`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('T-42-02 the panel builder gives sections, cards, images and escaped text', () => {
  const manifest = fixtureManifest()
  manifest.changes.find((c) => c.id === 'U-02').done =
    '<script>alert(1)</script>'
  const html = buildPanel({
    manifest,
    findings: reportRows,
    sets: sketchSets,
    before: 'abc1234',
    after: 'def5678',
    date: '2026-10-23',
  })
  assert.match(html, /<title>UI changes — step 42<\/title>/)
  const headings = [...html.matchAll(/<h2>(S-\d\d) — /g)].map((m) => m[1])
  assert.deepEqual(
    headings,
    sketchSets.map((set) => set.set),
  )
  assert.equal([...html.matchAll(/<article id="U-\d\d"/g)].length, 29)
  assert.match(html, /<article id="U-02" data-set="S-01">/)
  assert.match(html, /alt="before: board-map-390-light"/)
  assert.match(html, /alt="after: board-map-390-light"/)
  assert.match(html, /loading="lazy"/)
  assert.match(
    html,
    /<a href="img\/after\/board-map-390-light\.jpg" target="_blank"/,
  )
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.doesNotMatch(html, /(?:src|href)="https?:/)
})

test('T-42-02 changes.mjs copies only the cited images', () => {
  const manifest = fixtureManifest()
  const dir = changesFixture(manifest)
  try {
    writeFileSync(join(dir, 'before', 'uncited-390-light.jpg'), 'x')
    writeFileSync(join(dir, 'after', 'uncited-390-light.jpg'), 'x')
    const run = runChanges(dir, manifest)
    assert.equal(run.status, 0, run.stderr)
    const cited = new Set(manifest.changes.flatMap((c) => c.images))
    for (const side of ['before', 'after']) {
      const copied = readdirSync(join(run.out, 'img', side)).map((file) =>
        file.replace(/\.jpg$/, ''),
      )
      assert.deepEqual([...copied].sort(), [...cited].sort())
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('T-42-20 the refreshed report marks the 29 rows fixed in step 42', () => {
  for (const script of ['check.mjs', 'notes.mjs', 'sketch.mjs']) {
    const run = spawnSync(
      'node',
      [join(root, 'scripts', 'ui-review', script)],
      {
        cwd: root,
        encoding: 'utf8',
      },
    )
    assert.equal(run.status, 0, `${script}: ${run.stdout}${run.stderr}`)
  }
  const inSets = new Set(sketchSets.flatMap((set) => set.ids))
  assert.equal(inSets.size, 29)
  const stepOf = new Map()
  const header = reportText.split('\n').find((l) => l.startsWith('| ID |'))
  const stepColumn =
    header
      .split('|')
      .map((c) => c.trim())
      .indexOf('Step') - 1
  for (const line of reportText.split('\n')) {
    const cells = line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((c) => c.trim())
    if (/^U-\d\d+$/.test(cells[0] ?? '') && cells.length === 9)
      stepOf.set(cells[0], cells[stepColumn])
  }
  for (const [id, step] of stepOf) {
    if (inSets.has(id)) assert.equal(step, 'fixed in step 42', id)
    else assert.notEqual(step, 'fixed in step 42', id)
  }
  const repeat = reportText.slice(reportText.indexOf('## How to repeat'))
  assert.match(repeat, /pnpm ui:changes/)
})
