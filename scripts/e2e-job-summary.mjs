import { appendFileSync, readFileSync } from 'node:fs'

const reportPath = process.env.REPORT_PATH || 'e2e-report.json'
const report = JSON.parse(readFileSync(reportPath, 'utf8'))
const tests = []
walk(report.suites ?? [], [], tests)

const order = ['chromium', 'firefox', 'webkit', 'mobile']
const projects = [
  ...order.filter((name) => tests.some((test) => test.project === name)),
  ...[...new Set(tests.map((test) => test.project).filter(Boolean))].filter(
    (name) => !order.includes(name),
  ),
]

const lines = [
  '## Playwright',
  '',
  '| Project | Passed | Failed | Flaky | Skipped |',
  '| --- | ---: | ---: | ---: | ---: |',
]
for (const project of projects) {
  const rows = tests.filter((test) => test.project === project)
  lines.push(
    `| ${project} | ${count(rows, 'expected')} | ${count(rows, 'unexpected')} | ${count(rows, 'flaky')} | ${count(rows, 'skipped')} |`,
  )
}

const failed = tests.filter((test) => test.status === 'unexpected')
const flaky = tests.filter((test) => test.status === 'flaky')
lines.push('', '### Failed', '')
lines.push(...names(failed))
lines.push('', '### Flaky', '')
lines.push(...names(flaky))

const artifactUrl = process.env.ARTIFACT_URL
if (artifactUrl) {
  lines.push(
    '',
    `[playwright-report artifact](${artifactUrl}) (download \`playwright-report\` from this run)`,
  )
}
lines.push('')

const markdown = lines.join('\n')
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
} else {
  process.stdout.write(markdown)
}

function walk(suites, titles, out) {
  for (const suite of suites) {
    const next = suite.title ? [...titles, suite.title] : titles
    for (const spec of suite.specs ?? []) {
      const name = [...next, spec.title].filter(Boolean).join(' › ')
      for (const test of spec.tests ?? []) {
        out.push({
          project: test.projectName,
          status: test.status,
          name,
        })
      }
    }
    if (suite.suites) walk(suite.suites, next, out)
  }
}

function count(rows, status) {
  return rows.filter((row) => row.status === status).length
}

function names(rows) {
  if (rows.length === 0) return ['- none']
  return rows.map((row) => `- ${row.project}: ${row.name}`)
}
