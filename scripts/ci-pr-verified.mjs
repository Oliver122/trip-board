// Decides whether a commit pushed to main is exactly what a green pull request
// run already tested (step 36), so main can skip the same tests.
//
// The PR run's `ci-passed` job uploads an artifact named
// `tested-tree-<pr number>-<tree sha>` (plus tested-tree.json with the same
// data). Encoding both in the name means this script only needs the artifact
// list, not a zip download. It compares that tree with the pushed commit's tree
// from the git API.
//
// CLI (used by the workflow): GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA;
// writes `verified=<bool>` to $GITHUB_OUTPUT and a line to $GITHUB_STEP_SUMMARY.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export const ARTIFACT_PREFIX = 'tested-tree-'

const no = (reason, extra = {}) => ({ verified: false, reason, ...extra })

// api = { get(path) -> parsed JSON, throws on a non-2xx answer }
export async function prVerified({ sha, repo, api }) {
  try {
    const pulls = await api.get(`/repos/${repo}/commits/${sha}/pulls`)
    const merged = pulls.filter((p) => p.merged_at)
    if (merged.length !== 1) return no('no_pull_request')
    const pr = merged[0]

    const { workflow_runs: runs } = await api.get(
      `/repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`,
    )
    const latest = [...runs].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0]
    if (!latest || latest.conclusion !== 'success') return no('run_not_green')
    const found = { pr: pr.number, run_url: latest.html_url }

    const { artifacts } = await api.get(
      `/repos/${repo}/actions/runs/${latest.id}/artifacts?per_page=100`,
    )
    const prefix = `${ARTIFACT_PREFIX}${pr.number}-`
    const trees = artifacts
      .filter((a) => !a.expired && a.name.startsWith(prefix))
      .map((a) => a.name.slice(prefix.length))
    if (trees.length === 0) return no('no_tested_tree', found)

    const commit = await api.get(`/repos/${repo}/git/commits/${sha}`)
    if (!trees.includes(commit.tree.sha)) return no('tree_mismatch', found)
    return { verified: true, reason: 'verified', ...found }
  } catch {
    return no('api_error')
  }
}

export function githubApi(token, fetch = globalThis.fetch) {
  return {
    async get(path) {
      const res = await fetch(`https://api.github.com${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      if (!res.ok) throw new Error(`${path}: ${res.status}`)
      return res.json()
    },
  }
}

async function main() {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA } = process.env
  const result = await prVerified({
    sha: GITHUB_SHA,
    repo: GITHUB_REPOSITORY,
    api: githubApi(GITHUB_TOKEN),
  })
  const line = result.verified
    ? `pr-verified: true — reusing pull request #${result.pr} run ${result.run_url}`
    : `pr-verified: false (${result.reason}) — running the full pipeline`
  console.log(line)
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `verified=${result.verified}\n`,
    )
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  await main()
