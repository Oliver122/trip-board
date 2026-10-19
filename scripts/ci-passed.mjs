import { fileURLToPath } from 'node:url'

const TEST_JOBS = ['static', 'build', 'e2e', 'e2e-report']

// needs = the workflow's `toJson(needs)`. Returns the jobs that make CI fail.
// A push to main may skip the four test jobs when pr-verified proved the
// commit equals a green pull request run (step 36); everywhere else a skipped
// or cancelled job counts as failed. pr-verified itself only exists on push.
export function ciPassed({ event, needs }) {
  const jobs = Object.entries(needs)
  const verifiedPush =
    event === 'push' &&
    needs['pr-verified']?.result === 'success' &&
    needs['pr-verified'].outputs?.verified === 'true'
  const bad = jobs.filter(([name, job]) => {
    if (name === 'pr-verified' && event !== 'push')
      return job.result !== 'success' && job.result !== 'skipped'
    if (verifiedPush && TEST_JOBS.includes(name))
      return job.result !== 'skipped'
    return job.result !== 'success'
  })
  return {
    ok: bad.length === 0,
    bad: bad.map(([name, job]) => [name, job.result]),
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { ok, bad } = ciPassed({
    event: process.env.EVENT_NAME,
    needs: JSON.parse(process.env.NEEDS || '{}'),
  })
  if (!ok) {
    console.error('ci-passed requires every job to succeed:')
    for (const [name, result] of bad) console.error(`${name}: ${result}`)
    process.exit(1)
  }
}
