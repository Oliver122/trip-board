import fs from 'node:fs'
import path from 'node:path'
import { AREAS } from './parse.mjs'
import { buildIndex, isUnlocated } from './index.mjs'

const CORE_ID = /^C-([A-Z]+)-(\d{2,3})$/
const CHANGES = new Set(['add', 'modify', 'remove'])

// Returns a list of "file:line: message" strings; empty means OK.
export async function runCheck(model) {
  const problems = []
  const add = (file, line, msg) =>
    problems.push(line ? `${file}:${line}: ${msg}` : `${file}: ${msg}`)
  const prefixes = new Set(Object.values(AREAS))

  for (const c of model.coreFiles)
    for (const e of c.errors) add(e.file, e.line, e.msg)

  const seen = new Map()
  for (const r of model.rules) {
    const first = seen.get(r.id)
    if (first)
      add(
        r.file,
        r.line,
        `duplicate core ID ${r.id} (first defined at ${first.file}:${first.line})`,
      )
    else seen.set(r.id, r)
  }

  for (const s of model.steps) {
    if (!s.titleLine) add(s.file, 1, 'first line must be "# Step NN — Title"')
    if (s.statusRaw !== null && !s.statusValid)
      add(
        s.file,
        s.statusLine,
        `**Status:** must be "planned" or "integrated YYYY-MM-DD", found "${s.statusRaw}"`,
      )
    const integrated = s.status === 'integrated'
    for (const ch of s.changes) {
      const m = ch.coreId.match(CORE_ID)
      if (!m || !prefixes.has(m[1])) {
        add(s.file, ch.line, `Core changes: malformed core ID "${ch.coreId}"`)
        continue
      }
      if (!CHANGES.has(ch.change)) {
        add(
          s.file,
          ch.line,
          `Core changes: ${ch.coreId} has change "${ch.change}", expected add, modify or remove`,
        )
        continue
      }
      if (ch.cols !== 3)
        add(
          s.file,
          ch.line,
          `Core changes: row has ${ch.cols} columns, expected 3 (Core ID | Change | From)`,
        )
      const rule = model.ruleById.get(ch.coreId)
      if (ch.change === 'add') {
        if (!integrated) {
          if (rule)
            add(
              s.file,
              ch.line,
              `Core changes: add ${ch.coreId} but it already exists in ${rule.file}:${rule.line}`,
            )
        } else if (!rule)
          add(
            s.file,
            ch.line,
            `Core changes: step ${s.num} is integrated but added ${ch.coreId} is missing from the core files`,
          )
        else if (rule.since !== s.num)
          add(
            s.file,
            ch.line,
            `Core changes: step ${s.num} is integrated but ${ch.coreId} has Since ${rule.since}`,
          )
        continue
      }
      if (!rule) {
        add(
          s.file,
          ch.line,
          `Core changes: ${ch.change} ${ch.coreId} but it does not exist in the core files`,
        )
        continue
      }
      if (integrated && rule.since !== s.num) {
        if (!rule.changedBy.includes(s.num))
          add(
            s.file,
            ch.line,
            `Core changes: step ${s.num} is integrated but is not in Changed by of ${ch.coreId} (${rule.file}:${rule.line})`,
          )
        if (ch.change === 'remove' && rule.status !== 'removed')
          add(
            s.file,
            ch.line,
            `Core changes: step ${s.num} removes ${ch.coreId} but its status is ${rule.status}`,
          )
      }
    }
  }

  const gapIds = new Map(
    model.coreFiles.map((c) => [c.file, new Set(c.gaps.map((g) => g.id))]),
  )
  const flagged = new Set()
  for (const r of model.rules) {
    for (const t of r.tests) {
      if (!model.testDefs.has(t))
        add(
          r.file,
          r.line,
          `${r.id}: ${t} is not a Definition of Done row in any step`,
        )
      else if (isUnlocated(model, t) && !flagged.has(`${r.id}/${t}`)) {
        flagged.add(`${r.id}/${t}`)
        add(
          r.file,
          r.line,
          `${r.id}: ${t} (${model.testDefs.get(t).type}) is not located in any file under apps/, packages/, e2e/ or scripts/`,
        )
      }
    }
    if (
      r.status === 'active' &&
      r.tests.length === 0 &&
      !gapIds.get(r.file)?.has(r.id)
    ) {
      add(
        r.file,
        r.line,
        `${r.id}: active rule has no tests and is not listed under Known gaps`,
      )
    }
  }

  const indexRel = 'requirements/INDEX.md'
  const indexPath = path.join(model.root, indexRel)
  const fresh = await buildIndex(model)
  if (!fs.existsSync(indexPath)) add(indexRel, 0, 'missing, run pnpm req:build')
  else if (fs.readFileSync(indexPath, 'utf8') !== fresh)
    add(indexRel, 0, 'is stale, run pnpm req:build and commit the result')

  return problems
}
