#!/usr/bin/env node
// Stack plan for /req-implement (step 35): one part per step or `+` task, each
// part based on the previous part's branch.
//
//   pnpm req:stack 91 93 + fix toast spacing        -> JSON {parts: [...]}
//   pnpm req:stack 91 93 --resume                   -> same, branches may exist
//   pnpm req:stack 91 93 --stack-section 2 --prs <url> <url>
//
// `--prs` takes every argument after it (use `-` for a part without a PR).
// `--dir <path>` (or REQ_DIR) reads step files from another folder.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { URL, fileURLToPath } from 'node:url'
import { parseStep } from './parse.mjs'

const MAX_SLUG = 40
const MERGE_NOTE =
  'Merge in order; after the PR below merges, this one retargets to `main`.'

export function slugify(text, max = MAX_SLUG) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, max)
    .replace(/-+$/, '')
}

// "91 93 + fix toast + other" -> { steps: ['91','93'], tasks: ['fix toast','other'] }
export function parseParts(args) {
  const [head, ...tasks] = args.join(' ').split('+')
  return {
    steps: head.split(/[\s,]+/).filter(Boolean),
    tasks: tasks.map((t) => t.trim()).filter(Boolean),
  }
}

// Steps after the steps they depend on, ties by number. Returns the cyclic
// steps instead when there is a cycle.
export function orderSteps(steps) {
  const nums = new Set(steps.map((s) => s.num))
  const left = new Map(
    steps.map((s) => [s.num, s.depends.filter((d) => nums.has(d))]),
  )
  const order = []
  while (left.size > 0) {
    const ready = [...left.keys()]
      .filter((n) => left.get(n).every((d) => !left.has(d)))
      .sort()
    if (ready.length === 0) return { order, cycle: [...left.keys()].sort() }
    order.push(ready[0])
    left.delete(ready[0])
  }
  return { order, cycle: [] }
}

export function branchExists(branch, cwd = process.cwd()) {
  const has = (ref) =>
    spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd })
      .status === 0
  return {
    local: has(`refs/heads/${branch}`),
    remote: has(`refs/remotes/origin/${branch}`),
  }
}

// Returns { parts, errors }. `exists(branch) -> {local, remote}` is injectable.
export function buildPlan({
  steps: stepNums,
  tasks,
  dir,
  resume = false,
  exists = branchExists,
}) {
  const errors = []
  const found = []
  for (const num of [...new Set(stepNums)]) {
    const file = fs.existsSync(dir)
      ? fs.readdirSync(dir).find((f) => f.startsWith(`${num}-`))
      : undefined
    if (!/^\d\d$/.test(num) || !file) {
      errors.push(`unknown step ${num}: no ${dir}/${num}-*.md`)
      continue
    }
    const step = parseStep(dir, file)
    if (step.status === 'integrated')
      errors.push(`step ${num} is already integrated (${step.integratedOn})`)
    else found.push(step)
  }
  const { order, cycle } = orderSteps(found)
  if (cycle.length > 0)
    errors.push(`dependency cycle between steps ${cycle.join(', ')}`)
  const byNum = new Map(found.map((s) => [s.num, s]))
  const parts = order.map((num) => {
    const step = byNum.get(num)
    return {
      n: 0,
      kind: 'step',
      id: num,
      title: step.title,
      branch: `step-${num}-${step.slug.slice(3).replace(/\.md$/, '')}`,
    }
  })
  const used = new Set()
  tasks.forEach((text, i) => {
    let slug = slugify(text)
    if (!slug) return errors.push(`task ${i + 1} has no usable text`)
    for (let k = 2; used.has(slug); k++)
      slug = `${slugify(text, MAX_SLUG - String(k).length - 1)}-${k}`
    used.add(slug)
    parts.push({
      n: 0,
      kind: 'task',
      id: `task-${i + 1}`,
      title: text,
      branch: `task-${slug}`,
    })
  })
  parts.forEach((p, i) => {
    p.n = i + 1
    p.base = i === 0 ? 'main' : parts[i - 1].branch
    if (!resume) {
      const { local, remote } = exists(p.branch)
      if (local || remote)
        errors.push(
          `branch ${p.branch} already exists ${local ? 'locally' : 'on origin'} (use --resume to continue that stack)`,
        )
    }
  })
  return { parts, errors }
}

export function partLabel(part) {
  return part.kind === 'step'
    ? `Step ${part.id} — ${part.title}`
    : `Task — ${part.title}`
}

// The *Stack* section of a PR body. `prs[i]` is part i+1's PR url (or empty).
export function renderStackSection(parts, current, prs = []) {
  const lines = parts.map((p, i) => {
    const url = prs[i] && prs[i] !== '-' ? prs[i] : ''
    const link = url ? `[${partLabel(p)}](${url})` : partLabel(p)
    const state = url ? '' : ' — not opened'
    const here = p.n === current ? ' — **this PR**' : ''
    return `${p.n}. ${link}${state}${here} (\`${p.branch}\` → \`${p.base}\`)`
  })
  return ['## Stack', '', ...lines, '', MERGE_NOTE, ''].join('\n')
}

function parseArgs(argv) {
  const opts = { parts: [], resume: false, prs: [], dir: process.env.REQ_DIR }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--resume') opts.resume = true
    else if (a === '--dir') opts.dir = argv[++i]
    else if (a === '--stack-section') opts.section = Number(argv[++i])
    else if (a === '--prs') {
      opts.prs = argv.slice(i + 1)
      break
    } else opts.parts.push(a)
  }
  return opts
}

export function main(argv) {
  const opts = parseArgs(argv)
  const repo = fileURLToPath(new URL('../../', import.meta.url))
  const dir = path.resolve(opts.dir ?? path.join(repo, 'requirements'))
  const { steps, tasks } = parseParts(opts.parts)
  if (steps.length + tasks.length === 0) {
    console.error('usage: pnpm req:stack <step…> [+ task text…] [--resume]')
    return 1
  }
  const { parts, errors } = buildPlan({
    steps,
    tasks,
    dir,
    resume: opts.resume || opts.section !== undefined,
  })
  if (errors.length > 0) {
    for (const e of errors) console.error(e)
    return 1
  }
  if (opts.section !== undefined) {
    if (!parts.some((p) => p.n === opts.section)) {
      console.error(`--stack-section ${opts.section}: no such part`)
      return 1
    }
    process.stdout.write(renderStackSection(parts, opts.section, opts.prs))
  } else console.log(JSON.stringify({ parts }, null, 2))
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = main(process.argv.slice(2))
