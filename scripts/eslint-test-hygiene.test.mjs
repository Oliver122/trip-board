import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ESLint } from 'eslint'

const eslint = new ESLint()

async function messages(code, filePath = 'e2e/fixture.spec.ts') {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter(
    (m) => m.ruleId === 'tripboard-tests/no-focused-or-skipped-tests',
  )
}

test('T-48-04 .only and unconditional skips are errors, conditional skips are not (R-48-03)', async () => {
  const only = await messages(`test.only('a', async () => {})`)
  assert.equal(only.length, 1)
  assert.equal(only[0].severity, 2)

  assert.equal((await messages(`test.describe.only('a', () => {})`)).length, 1)

  const skip = await messages(
    `it.skip('a', () => {})`,
    'apps/api/src/x.test.ts',
  )
  assert.equal(skip.length, 1)
  assert.equal(skip[0].severity, 2)

  assert.equal((await messages(`test.fixme('a', async () => {})`)).length, 1)
  assert.equal(
    (await messages(`test('a', async () => {\n  test.skip()\n})`)).length,
    1,
  )

  assert.deepEqual(
    await messages(
      `test.skip(({ browserName }) => browserName !== 'chromium')`,
    ),
    [],
  )
  assert.deepEqual(await messages(`test.skip(cond, 'reason')`), [])
})
