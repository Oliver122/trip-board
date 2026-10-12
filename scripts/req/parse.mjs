import fs from 'node:fs'
import path from 'node:path'

// Area -> core ID prefix (fixed, see requirements/core/_FORMAT.md).
export const AREAS = {
  app: 'APP',
  auth: 'AUTH',
  trips: 'TRIP',
  map: 'MAP',
  spots: 'SPOT',
  kinds: 'KIND',
  images: 'IMG',
  list: 'LIST',
  planning: 'PLAN',
  home: 'HOME',
  members: 'MEMB',
  export: 'EXP',
  discussions: 'DISC',
  import: 'IMP',
  live: 'LIVE',
  admin: 'ADMIN',
  ops: 'OPS',
}

export const CORE_COLUMNS = [
  'ID',
  'Rule',
  'Status',
  'Since',
  'Changed by',
  'Tests',
]
export const LOCATE_DIRS = ['apps', 'packages', 'e2e', 'scripts']
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
])
const MAX_FILE_BYTES = 2 * 1024 * 1024

const DASH = '—'
const CORE_ID = /^C-([A-Z]+)-(\d{2,3})$/
const T_ID = /^T-\d\d-\d\d+$/
const STEP_NO = /^\d\d$/

export function splitRow(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  return s.split(/(?<!\\)\|/).map((c) => c.trim())
}

function isSeparator(cells) {
  return cells.every((c) => /^:?-+:?$/.test(c))
}

function posix(p) {
  return p.split(path.sep).join('/')
}

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/)
}

// "08 (quotas), 13 (members). Activity …" -> ['08', '13']
export function parseDepends(raw) {
  const text = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .trim()
  const m = text.match(/^(\d\d(?:\s*,\s*\d\d)*)(?!\d)/)
  return m ? m[1].split(/\s*,\s*/) : []
}

function listCell(cell) {
  const t = cell.trim()
  if (t === DASH || t === '' || t === '-') return []
  return t.split(',').map((s) => s.trim())
}

export function firstSentence(text) {
  const s = text.replace(/<!--.*?-->/g, '').trim()
  const re = /[.!?](?=\s|$)/g
  let m
  while ((m = re.exec(s))) {
    const before = s.slice(0, m.index)
    const ticks = (before.match(/`/g) || []).length
    if (ticks % 2 === 1) continue
    if (/(?:\be\.g|\bi\.e|\bvs|\betc|\bapprox)$/i.test(before)) continue
    return s.slice(0, m.index + 1)
  }
  return s
}

export function parseCoreFile(root, relFile) {
  const area = path.basename(relFile, '.md')
  const prefix = AREAS[area] ?? null
  const lines = readLines(path.join(root, relFile))
  const out = {
    file: relFile,
    area,
    prefix,
    title: area,
    rules: [],
    gaps: [],
    errors: [],
  }
  const err = (line, msg) => out.errors.push({ file: relFile, line, msg })
  if (!prefix)
    err(
      1,
      `unknown area "${area}" (expected one of ${Object.keys(AREAS).join(', ')})`,
    )
  let inTable = false
  let sepPending = false
  let headerOk = false
  let inGaps = false
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1
    const t = lines[i].trim()
    const h1 = t.match(/^#\s+(.*)$/)
    if (h1) out.title = h1[1].replace(/^Core\s*[—-]\s*/, '')
    if (/^##\s+/.test(t)) {
      inGaps = /^##\s+known gaps\b/i.test(t)
      inTable = false
      continue
    }
    if (inGaps) {
      const g = t.match(/^[-*]\s+(C-[A-Z]+-\d+)\s*:/)
      if (g) out.gaps.push({ id: g[1], line: n })
      continue
    }
    if (!t.startsWith('|')) {
      inTable = false
      continue
    }
    const cells = splitRow(t)
    if (!inTable) {
      inTable = true
      sepPending = true
      headerOk =
        cells.length === CORE_COLUMNS.length &&
        CORE_COLUMNS.every((c, k) => cells[k] === c)
      if (!headerOk)
        err(
          n,
          `table header must be | ${CORE_COLUMNS.join(' | ')} | (found ${cells.length} columns: ${cells.join(' | ')})`,
        )
      continue
    }
    if (sepPending && isSeparator(cells)) {
      sepPending = false
      continue
    }
    sepPending = false
    if (!headerOk) continue
    if (cells.length !== CORE_COLUMNS.length) {
      err(n, `row has ${cells.length} columns, expected ${CORE_COLUMNS.length}`)
      continue
    }
    const [id, ruleRaw, status, since, changed, tests] = cells
    let okId = true
    const m = id.match(CORE_ID)
    if (!m) {
      err(n, `malformed core ID "${id}" (expected C-${prefix ?? 'AREA'}-NN)`)
      okId = false
    } else if (prefix && m[1] !== prefix) {
      err(n, `${id} is in the wrong area file (${relFile} uses C-${prefix}-NN)`)
    }
    if (status !== 'active' && status !== 'removed')
      err(n, `${id}: Status must be active or removed, found "${status}"`)
    if (!STEP_NO.test(since))
      err(n, `${id}: Since must be one two-digit step number, found "${since}"`)
    const changedBy = listCell(changed)
    if (changedBy.some((s) => !STEP_NO.test(s)))
      err(
        n,
        `${id}: Changed by must be two-digit step numbers or ${DASH}, found "${changed}"`,
      )
    else if (changedBy.some((s, k) => k > 0 && s <= changedBy[k - 1]))
      err(n, `${id}: Changed by must be in ascending order, found "${changed}"`)
    const testIds = listCell(tests)
    if (testIds.some((s) => !T_ID.test(s)))
      err(n, `${id}: Tests must be T-IDs or ${DASH}, found "${tests}"`)
    if (!okId) continue
    const rids = [...ruleRaw.matchAll(/R-\d\d-\d+/g)].map((x) => x[0])
    out.rules.push({
      id,
      area,
      file: relFile,
      line: n,
      rule: ruleRaw
        .replace(/<!--.*?-->/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
      rids,
      status,
      since,
      changedBy,
      tests: testIds,
    })
  }
  return out
}

export function parseUnmapped(root) {
  const rel = 'requirements/core/_unmapped.md'
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) return []
  const rows = []
  readLines(file).forEach((line, i) => {
    const cells = splitRow(line)
    if (/^R-\d\d-\d+$/.test(cells[0] ?? ''))
      rows.push({ rid: cells[0], reason: cells[1] ?? '', line: i + 1 })
  })
  return rows
}

function headerField(lines, name) {
  const re = new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.*)$`)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re)
    if (m) return { value: m[1].trim(), line: i + 1 }
    if (/^##\s/.test(lines[i])) break
  }
  return null
}

export function parseStep(root, relFile) {
  const lines = readLines(path.join(root, relFile))
  const base = path.basename(relFile)
  const num = base.slice(0, 2)
  const t = lines[0]?.match(/^#\s+Step\s+(\d\d)\s+[—-]\s+(.*)$/)
  const dep = headerField(lines, 'Depends on')
  const result = headerField(lines, 'Result')
  const core = headerField(lines, 'Core')
  const status = headerField(lines, 'Status')
  const step = {
    file: relFile,
    num,
    slug: base,
    title: t ? t[2].trim() : base,
    titleLine: !!t,
    depends: dep ? parseDepends(dep.value) : [],
    result: result?.value ?? null,
    coreRaw: core?.value ?? null,
    coreIds: core
      ? [...core.value.matchAll(/C-[A-Z]+-\d+/g)].map((m) => m[0])
      : [],
    statusRaw: status?.value ?? null,
    status: 'planned',
    integratedOn: null,
    statusValid: true,
    rids: [],
    rows: new Map(),
    tests: new Map(),
    changes: [],
  }
  if (status) {
    const m = status.value.match(/^integrated (\d{4}-\d\d-\d\d)$/)
    if (m) {
      step.status = 'integrated'
      step.integratedOn = m[1]
    } else if (status.value !== 'planned') step.statusValid = false
    step.statusLine = status.line
  }
  let inChanges = false
  lines.forEach((line, i) => {
    const n = i + 1
    if (/^##\s+/.test(line)) inChanges = /^##\s+core changes\b/i.test(line)
    if (!line.startsWith('|')) return
    const cells = splitRow(line)
    if (/^R-\d\d-\d+$/.test(cells[0])) {
      step.rids.push(cells[0])
      step.rows.set(cells[0], cells[1] ?? '')
    } else if (/^T-\d\d-\d+$/.test(cells[0]) && cells.length >= 4) {
      step.tests.set(cells[0], {
        type: cells[1].trim().toLowerCase(),
        covers: cells[2],
        line: n,
      })
    } else if (inChanges && cells[0] !== 'Core ID' && !isSeparator(cells)) {
      step.changes.push({
        coreId: cells[0],
        change: (cells[1] ?? '').trim(),
        from: [...(cells[2] ?? '').matchAll(/R-\d\d-\d+/g)].map((m) => m[0]),
        line: n,
        cols: cells.length,
      })
    }
  })
  return step
}

function walk(dir, rel, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const r = `${rel}/${e.name}`
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || r === 'scripts/req/fixtures') continue
      walk(path.join(dir, e.name), r, out)
    } else if (e.isFile()) out.push(r)
  }
}

// T-ID -> sorted repo-relative files (apps/, packages/, e2e/, scripts/) that mention it.
export function locateTests(root) {
  const files = []
  for (const d of LOCATE_DIRS) walk(path.join(root, d), d, files)
  const map = new Map()
  for (const rel of files) {
    const abs = path.join(root, rel)
    let buf
    try {
      if (fs.statSync(abs).size > MAX_FILE_BYTES) continue
      buf = fs.readFileSync(abs)
    } catch {
      continue
    }
    if (buf.subarray(0, 8000).includes(0)) continue
    const seen = new Set(buf.toString('utf8').match(/T-\d\d-\d\d+/g) ?? [])
    for (const id of seen) {
      if (!map.has(id)) map.set(id, [])
      map.get(id).push(posix(rel))
    }
  }
  for (const list of map.values()) list.sort()
  return map
}

// step number -> report text, for manual/ci tests
function readReports(root) {
  const dir = path.join(root, 'requirements/reports')
  const out = new Map()
  if (!fs.existsSync(dir)) return out
  for (const f of fs.readdirSync(dir).sort()) {
    const m = f.match(/^(\d\d)-report\.md$/)
    if (m)
      out.set(m[1], {
        file: `requirements/reports/${f}`,
        text: fs.readFileSync(path.join(dir, f), 'utf8'),
      })
  }
  return out
}

export function loadModel(root) {
  const reqDir = path.join(root, 'requirements')
  const steps = fs
    .readdirSync(reqDir)
    .filter((f) => /^\d\d-.*\.md$/.test(f))
    .sort()
    .map((f) => parseStep(root, `requirements/${f}`))
  const coreDir = path.join(reqDir, 'core')
  const coreFiles = fs.existsSync(coreDir)
    ? fs
        .readdirSync(coreDir)
        .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
        .sort()
        .map((f) => parseCoreFile(root, `requirements/core/${f}`))
    : []
  const rules = coreFiles.flatMap((c) => c.rules)
  const ruleById = new Map()
  for (const r of rules) if (!ruleById.has(r.id)) ruleById.set(r.id, r)
  const stepByNum = new Map(steps.map((s) => [s.num, s]))
  const testDefs = new Map()
  for (const s of steps)
    for (const [id, def] of s.tests)
      if (!testDefs.has(id)) testDefs.set(id, { ...def, step: s.num })
  const code = locateTests(root)
  const reports = readReports(root)
  // Files proving a T-ID: test files, or the step report for manual/ci tests.
  const locate = (id) => {
    const files = code.get(id) ?? []
    const def = testDefs.get(id)
    if (def && (def.type === 'manual' || def.type === 'ci')) {
      const rep = reports.get(def.step)
      if (rep?.text.includes(id))
        return { files: [...files, rep.file].sort(), informational: true }
      return { files, informational: true }
    }
    return { files, informational: false }
  }
  return {
    root,
    steps,
    stepByNum,
    coreFiles,
    rules,
    ruleById,
    unmapped: parseUnmapped(root),
    testDefs,
    locate,
  }
}
