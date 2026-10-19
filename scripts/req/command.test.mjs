import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { URL, fileURLToPath } from 'node:url'

const read = (rel) =>
  fs.readFileSync(
    fileURLToPath(new URL(`../../${rel}`, import.meta.url)),
    'utf8',
  )

test('T-35-04 req-implement.md describes the stack and PR flow', () => {
  const text = read('.claude/commands/req-implement.md')
  for (const needle of [
    'pnpm req:stack',
    'gh pr create --base',
    'git rebase -x',
    'git worktree add',
  ])
    assert.ok(text.includes(needle), `missing ${needle}`)
  const hint = text.match(/^argument-hint:\s*(.*)$/m)?.[1] ?? ''
  assert.match(hint, /\[step…\]/)
  assert.match(hint, /\+ task/)
  assert.ok(!text.includes('Do not commit unless the user asks'))
  for (const line of text.split('\n'))
    if (line.includes('git add -A'))
      assert.match(
        line,
        /never/i,
        `git add -A outside a never sentence: ${line}`,
      )
})

test('T-35-04 README flow of a change mentions stacked PRs', () => {
  const text = read('requirements/README.md')
  const flow = text.slice(text.indexOf('**Flow of a change**'))
  assert.match(flow.slice(0, flow.indexOf('Step header')), /stacked PR/i)
})
