import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const knip = path.join(root, 'node_modules/.bin/knip')

function run(fixture) {
  return spawnSync(
    knip,
    [
      '--directory',
      path.join(root, 'scripts/deadcode/fixtures', fixture),
      '--no-progress',
      '--no-config-hints',
    ],
    { encoding: 'utf8' },
  )
}

test('T-48-07 knip fails on an unused export, file and dependency and names all three', () => {
  const result = run('dirty')
  const output = result.stdout + result.stderr
  assert.notEqual(result.status, 0, output)
  assert.match(output, /farewellUnusedExport/)
  assert.match(output, /orphanUnusedFile\.ts/)
  assert.match(output, /unused-dependency-fixture/)
})

test('T-48-07 knip exits 0 on the fixture without them', () => {
  const result = run('clean')
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
