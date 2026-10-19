import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { URL, fileURLToPath } from 'node:url'

const text = fs.readFileSync(
  fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url)),
  'utf8',
)

// The text of a top-level job: from "  name:" to the next two-space key.
function job(name) {
  const m = text.match(new RegExp(`^  ${name}:\\n((?:    .*\\n|\\n)*)`, 'm'))
  assert.ok(m, `job ${name} not found`)
  return m[1]
}

test('T-36-02 workflow_dispatch is a trigger', () => {
  assert.match(text, /^on:\n(?: {2}.*\n)*? {2}workflow_dispatch:/m)
})

test('T-36-02 pr-verified runs only on push, reads actions, exposes verified', () => {
  const j = job('pr-verified')
  assert.match(j, /if: github\.event_name == 'push'/)
  assert.match(j, /actions: read/)
  assert.match(j, /outputs:\n\s+verified:/)
})

test("T-36-02 test jobs skip when verified == 'true' and run on dispatch", () => {
  for (const name of ['static', 'build', 'e2e', 'e2e-report']) {
    const j = job(name)
    assert.match(j, /needs\.pr-verified\.outputs\.verified != 'true'/, name)
    assert.match(j, /needs: .*pr-verified/, name)
    // a skipped pr-verified (pull request, dispatch) must not skip the job
    assert.match(j, /!cancelled\(\)/, name)
  }
})

test('T-36-02 ci-passed needs pr-verified and uploads tested-tree on pull requests only', () => {
  const j = job('ci-passed')
  assert.match(j, /needs: \[pr-verified,/)
  assert.match(j, /EVENT_NAME: \$\{\{ github\.event_name \}\}/)
  const upload = j.slice(j.indexOf('upload-artifact'))
  assert.match(upload, /name: tested-tree-/)
  assert.match(upload, /success\(\) && github\.event_name == 'pull_request'/)
  assert.match(upload, /retention-days: 30/)
})

test('T-36-02 deploy keeps main-only conditions and runs after dispatch', () => {
  const j = job('deploy')
  assert.match(j, /needs: ci-passed/)
  assert.match(j, /github\.ref == 'refs\/heads\/main'/)
  assert.match(j, /github\.event_name == 'workflow_dispatch'/)
  assert.match(j, /github\.repository == 'Oliver122\/trip-board'/)
})

test('T-36-02 pull_request has no branch filter (R-35-11)', () => {
  assert.match(text, /^ {2}pull_request:\n(?! {4})/m)
})
