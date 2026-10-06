const needs = JSON.parse(process.env.NEEDS || '{}')
const bad = Object.entries(needs).filter(([, job]) => job.result !== 'success')

if (bad.length > 0) {
  console.error('ci-passed requires every job to succeed:')
  for (const [name, job] of bad) {
    console.error(`${name}: ${job.result}`)
  }
  process.exit(1)
}
