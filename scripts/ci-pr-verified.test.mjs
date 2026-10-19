import assert from 'node:assert/strict'
import { test } from 'node:test'
import { githubApi, prVerified } from './ci-pr-verified.mjs'

const SHA = 'abc123'
const REPO = 'o/r'
const TREE = 'tree-1'

function fakeApi({
  pulls = [{ number: 7, merged_at: '2026-01-01', head: { sha: 'head7' } }],
  runs = [
    {
      id: 1,
      conclusion: 'success',
      created_at: '2026-01-01T10:00:00Z',
      html_url: 'https://runs/1',
    },
  ],
  artifacts = [{ name: `tested-tree-7-${TREE}` }],
  tree = TREE,
  fail,
} = {}) {
  return {
    async get(path) {
      if (fail) throw new Error(fail)
      if (path.includes('/pulls')) return pulls
      if (path.includes('/workflows/')) return { workflow_runs: runs }
      if (path.includes('/artifacts')) return { artifacts }
      if (path.includes('/git/commits/')) return { tree: { sha: tree } }
      throw new Error(`unexpected ${path}`)
    },
  }
}

const check = (opts) => prVerified({ sha: SHA, repo: REPO, api: fakeApi(opts) })

test('T-36-01 merged PR, green latest run, matching tree is verified', async () => {
  const r = await check()
  assert.equal(r.verified, true)
  assert.equal(r.run_url, 'https://runs/1')
})

test('T-36-01 no pull request', async () => {
  assert.equal((await check({ pulls: [] })).reason, 'no_pull_request')
  assert.equal(
    (await check({ pulls: [{ number: 7, merged_at: null, head: {} }] })).reason,
    'no_pull_request',
  )
})

test('T-36-01 two pull requests for one commit', async () => {
  const pr = (n) => ({ number: n, merged_at: '2026-01-01', head: { sha: 'h' } })
  assert.equal(
    (await check({ pulls: [pr(1), pr(2)] })).reason,
    'no_pull_request',
  )
})

test('T-36-01 latest run failed while an older one was green', async () => {
  const r = await check({
    runs: [
      { id: 1, conclusion: 'success', created_at: '2026-01-01T10:00:00Z' },
      { id: 2, conclusion: 'failure', created_at: '2026-01-01T11:00:00Z' },
    ],
  })
  assert.equal(r.verified, false)
  assert.equal(r.reason, 'run_not_green')
  assert.equal((await check({ runs: [] })).reason, 'run_not_green')
})

test('T-36-01 no tested-tree artifact for that PR', async () => {
  assert.equal((await check({ artifacts: [] })).reason, 'no_tested_tree')
  assert.equal(
    (await check({ artifacts: [{ name: `tested-tree-8-${TREE}` }] })).reason,
    'no_tested_tree',
  )
})

test('T-36-01 different tree', async () => {
  assert.equal((await check({ tree: 'other' })).reason, 'tree_mismatch')
})

test('T-36-01 the API throws', async () => {
  const r = await check({ fail: 'GitHub answered 500' })
  assert.deepEqual(r, { verified: false, reason: 'api_error' })
})

test('T-36-01 the API answers 500', async () => {
  const fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })
  const r = await prVerified({
    sha: 'abc',
    repo: 'o/r',
    api: githubApi('token', fetch),
  })
  assert.deepEqual(r, { verified: false, reason: 'api_error' })
})
