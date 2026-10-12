// pnpm req:build  -> writes requirements/INDEX.md
// pnpm req:check  -> validates core files, step files and INDEX.md (exit 1 on problems)
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { URL, fileURLToPath } from 'node:url'
import { loadModel } from './parse.mjs'
import { buildIndex } from './index.mjs'
import { runCheck } from './check.mjs'

const args = process.argv.slice(2)
const rootFlag = args.indexOf('--root')
const root = path.resolve(
  rootFlag >= 0
    ? (args[rootFlag + 1] ?? '.')
    : fileURLToPath(new URL('../../', import.meta.url)),
)
const model = loadModel(root)

if (args.includes('--check')) {
  const problems = await runCheck(model)
  if (problems.length) {
    for (const p of problems) console.error(p)
    console.error(
      `req:check failed: ${problems.length} problem${problems.length === 1 ? '' : 's'}`,
    )
    process.exitCode = 1
  } else {
    console.log(
      `req:check OK: ${model.steps.length} steps, ${model.rules.length} core rules in ${model.coreFiles.length} areas, INDEX.md up to date`,
    )
  }
} else {
  const text = await buildIndex(model)
  fs.writeFileSync(path.join(root, 'requirements/INDEX.md'), text)
  console.log(
    `wrote requirements/INDEX.md (${model.steps.length} steps, ${model.rules.length} core rules)`,
  )
  const problems = model.coreFiles.reduce((n, c) => n + c.errors.length, 0)
  if (problems)
    console.warn(
      `${problems} core file problem${problems === 1 ? '' : 's'}, run pnpm req:check`,
    )
}
