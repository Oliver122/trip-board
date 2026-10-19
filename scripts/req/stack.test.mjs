import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { URL, fileURLToPath } from 'node:url'
import { buildPlan, parseParts, renderStackSection, slugify } from './stack.mjs'

// Fixture steps 91-93 are written to a temp dir (their numbers never collide
// with real steps, and prettier leaves temp files alone).
const CLI = fileURLToPath(new URL('./stack.mjs', import.meta.url))

function stepFile(num, title, { depends = '—', status = 'planned' } = {}) {
  return `# Step ${num} — ${title}

**Goal:** fixture.
**Depends on:** ${depends}
**Result:** fixture.
**Core:** —
**Status:** ${status}

## Requirements
| ID | Requirement |
| --- | --- |
| R-${num}-01 | fixture |
`
}

function fixtureDir(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'req-stack-'))
  const files = {
    '91-alpha-feature.md': stepFile('91', 'Alpha feature'),
    '92-beta-done.md': stepFile('92', 'Beta done', {
      status: 'integrated 2026-01-02',
    }),
    '93-gamma-feature.md': stepFile('93', 'Gamma feature', { depends: '91' }),
    ...overrides,
  }
  for (const [f, text] of Object.entries(files))
    fs.writeFileSync(path.join(dir, f), text)
  return dir
}

function run(args, { cwd, dir } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, ...(dir ? { REQ_DIR: dir } : {}) },
    encoding: 'utf8',
  })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

const none = () => ({ local: false, remote: false })

test('T-35-01 plan: branches, bases and task after steps', () => {
  const dir = fixtureDir()
  const { steps, tasks } = parseParts([
    '91',
    '93',
    '+',
    'fix',
    'toast',
    'spacing',
  ])
  const { parts, errors } = buildPlan({ steps, tasks, dir, exists: none })
  assert.deepEqual(errors, [])
  assert.deepEqual(
    parts.map((p) => [p.kind, p.branch, p.base]),
    [
      ['step', 'step-91-alpha-feature', 'main'],
      ['step', 'step-93-gamma-feature', 'step-91-alpha-feature'],
      ['task', 'task-fix-toast-spacing', 'step-93-gamma-feature'],
    ],
  )
  assert.deepEqual(
    parts.map((p) => p.n),
    [1, 2, 3],
  )
})

test('T-35-01 plan: steps are reordered by dependency', () => {
  const dir = fixtureDir()
  const { parts } = buildPlan({
    steps: ['93', '91'],
    tasks: [],
    dir,
    exists: none,
  })
  assert.deepEqual(
    parts.map((p) => p.id),
    ['91', '93'],
  )
})

test('T-35-01 plan: a 60-character task is cut to 40 without a trailing dash', () => {
  const dir = fixtureDir()
  const text = 'make the toast spacing a bit wider on phones and tablets ok'
  const { parts } = buildPlan({ steps: [], tasks: [text], dir, exists: none })
  const slug = parts[0].branch.replace(/^task-/, '')
  assert.ok(slug.length <= 40)
  assert.ok(!slug.endsWith('-'))
  assert.equal(slug, slugify(text))
  assert.equal(slugify('abc def-' + 'x'.repeat(40), 8), 'abc-def')
})

test('T-35-01 cli: unknown, integrated and cyclic steps exit 1 naming the step', () => {
  const dir = fixtureDir()
  const unknown = run(['99'], { dir })
  assert.equal(unknown.code, 1)
  assert.match(unknown.err, /99/)
  const done = run(['92'], { dir })
  assert.equal(done.code, 1)
  assert.match(done.err, /92.*integrated/)
  const cyc = fixtureDir({
    '91-alpha-feature.md': stepFile('91', 'Alpha feature', { depends: '93' }),
  })
  const cycle = run(['91', '93'], { dir: cyc })
  assert.equal(cycle.code, 1)
  assert.match(cycle.err, /cycle.*91.*93/)
  const ok = run(['91', '93', '+', 'fix toast spacing'], { dir })
  assert.equal(ok.code, 0)
  assert.equal(JSON.parse(ok.out).parts.length, 3)
})

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
}

test('T-35-02 an existing branch fails unless --resume', () => {
  const dir = fixtureDir()
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'req-stack-git-'))
  git(repo, 'init', '-q', '-b', 'main')
  git(
    repo,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  )
  git(repo, 'branch', 'step-91-alpha-feature')
  const fresh = run(['93'], { cwd: repo, dir })
  assert.equal(fresh.code, 0)
  const blocked = run(['91'], { cwd: repo, dir })
  assert.equal(blocked.code, 1)
  assert.match(blocked.err, /step-91-alpha-feature/)
  const resumed = run(['91', '--resume'], { cwd: repo, dir })
  assert.equal(resumed.code, 0)
  assert.equal(JSON.parse(resumed.out).parts[0].branch, 'step-91-alpha-feature')
})

test('T-35-03 stack section lists parts, marks the current one and is stable', () => {
  const dir = fixtureDir()
  const args = ['91', '93', '+', 'fix toast', '--stack-section', '2']
  const prs = ['--prs', 'https://example.test/pull/1']
  const a = run([...args, ...prs], { dir })
  const b = run([...args, ...prs], { dir })
  assert.equal(a.code, 0, a.err)
  assert.equal(a.out, b.out)
  const lines = a.out.split('\n')
  const items = lines.filter((l) => /^\d\. /.test(l))
  assert.equal(items.length, 3)
  assert.match(
    items[0],
    /\[Step 91 — Alpha feature\]\(https:\/\/example\.test\/pull\/1\)/,
  )
  assert.doesNotMatch(items[0], /this PR|not opened/)
  assert.match(items[1], /Step 93/)
  assert.match(items[1], /not opened/)
  assert.match(items[1], /this PR/)
  assert.match(items[2], /Task — fix toast.*not opened/)
  assert.doesNotMatch(items[2], /this PR/)
  assert.ok(
    a.out
      .trimEnd()
      .endsWith(
        'Merge in order; after the PR below merges, this one retargets to `main`.',
      ),
  )
})

test('T-35-03 renderStackSection fills every link when all PRs exist', () => {
  const parts = [
    {
      n: 1,
      kind: 'step',
      id: '91',
      title: 'A',
      branch: 'step-91-a',
      base: 'main',
    },
    {
      n: 2,
      kind: 'task',
      id: 'task-1',
      title: 'x',
      branch: 'task-x',
      base: 'step-91-a',
    },
  ]
  const text = renderStackSection(parts, 1, ['u1', 'u2'])
  assert.doesNotMatch(text, /not opened/)
  assert.match(text, /\(u2\)/)
})
