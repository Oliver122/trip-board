// Builds the change panel of step 42 (R-42-03..05).
// node scripts/ui-review/changes.mjs [--before <dir>] [--after <dir>] [--manifest <file>] [--out <dir>]
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { plain, splitByHeading, tableRows } from './check.mjs'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')

const defaults = {
  before: 'test-results/ui-review-before',
  after: 'test-results/ui-review',
  manifest: 'docs/ui-review/changes-42.json',
  out: 'test-results/ui-changes',
}

export const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** The rows of the Findings table with every column. */
export function findingsTable(markdown) {
  const top = splitByHeading(markdown.split('\n'), '## ')
  const section = top.find((entry) => entry.title === 'Findings')
  if (!section) return []
  return tableRows(section.lines)
    .map((cells) => ({
      id: plain(cells[0] ?? ''),
      severity: plain(cells[1] ?? ''),
      category: plain(cells[2] ?? ''),
      screens: [...(cells[3] ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1]),
      widths: (cells[4] ?? '')
        .split(',')
        .map((width) => width.trim())
        .filter(Boolean),
      issue: cells[5] ?? '',
      suggested: cells[7] ?? '',
    }))
    .filter((row) => /^U-\d\d+$/.test(row.id))
}

/** The Implementation set table of docs/MOBILE_SKETCH.md: [{set, title, ids}] */
export function implementationSets(markdown) {
  const top = splitByHeading(markdown.split('\n'), '## ')
  const section = top.find((entry) => entry.title === 'Implementation set')
  if (!section) return []
  return tableRows(section.lines)
    .filter((cells) => /^S-\d\d$/.test(plain(cells[0] ?? '')))
    .map((cells) => ({
      set: plain(cells[0]),
      title: cells[1] ?? '',
      ids: (cells[2] ?? '').match(/U-\d\d+/g) ?? [],
    }))
}

const imagePattern = /^([a-z-]+)-(1280|768|390)-(light|dark)(-de)?$/

/**
 * @returns {string[]} one message per problem
 * @param {{manifest: any, findings: object[], sets: object[], exists: (path: string) => boolean, hasImage: (dir: 'before'|'after', name: string) => boolean, dirs?: {before: string, after: string}}} input
 */
export function validateManifest({
  manifest,
  findings,
  sets,
  exists,
  hasImage,
  dirs = { before: 'before', after: 'after' },
}) {
  const problems = []
  const changes = Array.isArray(manifest?.changes) ? manifest.changes : null
  if (!changes) return ['manifest: "changes" must be an array']
  if (manifest.step !== 42) problems.push('manifest: "step" must be 42')
  if (typeof manifest.base !== 'string' || !manifest.base)
    problems.push('manifest: "base" must be a commit string')
  const setOf = new Map(sets.flatMap((s) => s.ids.map((id) => [id, s.set])))
  const rowOf = new Map(findings.map((row) => [row.id, row]))
  const seen = new Map()
  for (const change of changes) {
    const id = change?.id
    if (typeof id !== 'string') {
      problems.push('entry without an "id"')
      continue
    }
    seen.set(id, (seen.get(id) ?? 0) + 1)
    if (!rowOf.has(id)) problems.push(`${id}: not in Findings of UI_REVIEW.md`)
    else if (!setOf.has(id))
      problems.push(`${id}: in no set S-01..S-08 of the sketch`)
    else if (change.set !== setOf.get(id))
      problems.push(
        `${id}: set is ${change.set}, the sketch says ${setOf.get(id)}`,
      )
    if (typeof change.done !== 'string' || !change.done.trim())
      problems.push(`${id}: "done" is missing`)
    if (!Array.isArray(change.files) || change.files.length === 0)
      problems.push(`${id}: "files" must be a non-empty array`)
    else
      for (const file of change.files)
        if (!exists(file)) problems.push(`${id}: file ${file} does not exist`)
    const images = change.images
    if (!Array.isArray(images) || images.length < 1 || images.length > 6) {
      problems.push(`${id}: "images" must have 1 to 6 names`)
      continue
    }
    const row = rowOf.get(id)
    let has390 = false
    for (const name of images) {
      const match = imagePattern.exec(name)
      if (!match) {
        problems.push(`${id}: image ${name} is not <screen>-<width>-<variant>`)
        continue
      }
      if (match[2] === '390') has390 = true
      if (row && !row.screens.includes(match[1]))
        problems.push(`${id}: image ${name} is not of a screen of the row`)
      for (const side of ['before', 'after'])
        if (!hasImage(side, name))
          problems.push(`${id}: image ${name}.jpg is missing in ${dirs[side]}`)
    }
    if (row?.widths.includes('390') && !has390)
      problems.push(`${id}: no image at 390`)
  }
  for (const [id, set] of setOf)
    if (!seen.has(id)) problems.push(`${id}: no entry for ${set}`)
  for (const [id, count] of seen)
    if (count > 1) problems.push(`${id}: ${count} entries`)
  return problems
}

const script = `
const KEY = 'ui-changes-42'
let store = {}
try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { store = {} }
const cards = [...document.querySelectorAll('article[id^="U-"]')]
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* session only */ } }
const verdictOf = (id) => store[id]?.verdict || 'open'
const filter = document.getElementById('filter')
function refresh() {
  const counts = { open: 0, accepted: 0, needs: 0 }
  for (const card of cards) {
    const v = verdictOf(card.id)
    counts[v === 'accepted' ? 'accepted' : v === 'needs-work' ? 'needs' : 'open']++
    const f = filter.value
    card.hidden = !(f === 'all' || f === v || f === card.dataset.set)
  }
  for (const key of Object.keys(counts)) document.getElementById('count-' + key).textContent = counts[key]
}
for (const card of cards) {
  const entry = store[card.id]
  for (const radio of card.querySelectorAll('input[type=radio]')) {
    radio.checked = entry?.verdict === radio.value
    radio.addEventListener('change', () => { store[card.id] = { verdict: radio.value, note: store[card.id]?.note || '' }; save(); refresh() })
  }
  const note = card.querySelector('textarea')
  note.value = entry?.note || ''
  note.addEventListener('input', () => { store[card.id] = { verdict: verdictOf(card.id) === 'open' ? '' : verdictOf(card.id), note: note.value }; save() })
}
filter.addEventListener('change', refresh)
document.getElementById('export').addEventListener('click', () => {
  const data = { step: 42, after: document.body.dataset.after, verdicts: cards.map((c) => ({ id: c.id, verdict: verdictOf(c.id), note: store[c.id]?.note || '' })) }
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  link.download = 'ui-changes-42-verdicts.json'
  link.click()
})
refresh()
`

const style = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--muted:#555;--card:#f6f6f6;--line:#c8c8c8}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--muted:#b0b0b0;--card:#222;--line:#444}}
body{background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:72rem;padding:16px}
article{background:var(--card);border:1px solid var(--line);border-radius:8px;margin:16px 0;padding:16px}
article[hidden]{display:none}
.pair{display:grid;gap:8px;grid-template-columns:1fr 1fr}
@media (max-width:700px){.pair{grid-template-columns:1fr}}
img{max-width:100%;height:auto;border:1px solid var(--line)}
.muted{color:var(--muted)}
textarea{background:var(--bg);color:var(--fg);border:1px solid var(--line);width:100%;min-height:3rem}
a{color:inherit}
`

const imgFigure = (name) =>
  `<figure><div class="pair">` +
  ['before', 'after']
    .map(
      (side) =>
        `<div><a href="img/${side}/${escapeHtml(name)}.jpg" target="_blank" rel="noopener"><img src="img/${side}/${escapeHtml(name)}.jpg" alt="${side}: ${escapeHtml(name)}" loading="lazy"></a><div class="muted">${side}</div></div>`,
    )
    .join('') +
  `</div><figcaption class="muted">${escapeHtml(name)}</figcaption></figure>`

/** The panel as an HTML string; every value from files is escaped. */
export function buildPanel({ manifest, findings, sets, before, after, date }) {
  const rowOf = new Map(findings.map((row) => [row.id, row]))
  const byId = new Map(manifest.changes.map((c) => [c.id, c]))
  const perSet = sets
    .map((s) => ({
      ...s,
      changes: s.ids.map((id) => byId.get(id)).filter(Boolean),
    }))
    .filter((s) => s.changes.length > 0)
  const options = perSet
    .map(
      (s) =>
        `<option value="${escapeHtml(s.set)}">${escapeHtml(s.set)}</option>`,
    )
    .join('')
  const summary = perSet
    .map((s) => `${escapeHtml(s.set)}: ${s.changes.length}`)
    .join(', ')
  const body = perSet
    .map((s) => {
      const cards = s.changes
        .map((change) => {
          const row = rowOf.get(change.id) ?? {}
          return `<article id="${escapeHtml(change.id)}" data-set="${escapeHtml(s.set)}">
<h3>${escapeHtml(change.id)}</h3>
<p class="muted">Severity: ${escapeHtml(row.severity)} · Category: ${escapeHtml(row.category)} · Widths: ${escapeHtml((row.widths ?? []).join(', '))}</p>
<p><strong>Issue:</strong> ${escapeHtml(row.issue)}</p>
<p><strong>Suggested fix:</strong> ${escapeHtml(row.suggested)}</p>
<p><strong>Done:</strong> ${escapeHtml(change.done)}</p>
<ul>${change.files.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join('')}</ul>
${change.images.map(imgFigure).join('\n')}
<fieldset><legend>Verdict for ${escapeHtml(change.id)}</legend>
<label><input type="radio" name="v-${escapeHtml(change.id)}" value="accepted"> Accepted</label>
<label><input type="radio" name="v-${escapeHtml(change.id)}" value="needs-work"> Needs work</label></fieldset>
<label>Note for ${escapeHtml(change.id)}<textarea></textarea></label>
</article>`
        })
        .join('\n')
      return `<section><h2>${escapeHtml(s.set)} — ${escapeHtml(s.title)}</h2>\n${cards}</section>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>UI changes — step 42</title><style>${style}</style></head>
<body data-after="${escapeHtml(after)}"><main>
<h1>UI changes — step 42</h1>
<p>Base ${escapeHtml(before)}, after ${escapeHtml(after)}, ${escapeHtml(date)}. Changes per set: ${summary}.</p>
<p>Accepted <span id="count-accepted">0</span> · Needs work <span id="count-needs">0</span> · Open <span id="count-open">0</span></p>
<p><label>Show <select id="filter"><option value="all">All</option><option value="open">Open</option><option value="accepted">Accepted</option><option value="needs-work">Needs work</option>${options}</select></label>
<button type="button" id="export">Export verdicts</button></p>
${body}
</main><script>${script}</script></body></html>
`
}

function parseArgs(argv) {
  const options = { ...defaults }
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    if (!(key in defaults) || argv[i + 1] === undefined)
      throw new Error(`Unknown or incomplete option ${argv[i]}`)
    options[key] = argv[i + 1]
  }
  return options
}

const fromRoot = (path) => (isAbsolute(path) ? path : resolve(root, path))

function main() {
  const options = parseArgs(process.argv.slice(2))
  const manifest = JSON.parse(readFileSync(fromRoot(options.manifest), 'utf8'))
  const findings = findingsTable(
    readFileSync(join(root, 'docs', 'UI_REVIEW.md'), 'utf8'),
  )
  const sets = implementationSets(
    readFileSync(join(root, 'docs', 'MOBILE_SKETCH.md'), 'utf8'),
  )
  const dirs = {
    before: fromRoot(options.before),
    after: fromRoot(options.after),
  }
  const problems = validateManifest({
    manifest,
    findings,
    sets,
    exists: (file) => existsSync(join(root, file)),
    hasImage: (side, name) => existsSync(join(dirs[side], `${name}.jpg`)),
    dirs: { before: options.before, after: options.after },
  })
  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  const commitOf = (dir) => {
    try {
      return JSON.parse(readFileSync(join(dir, 'findings.json'), 'utf8')).commit
    } catch {
      return '?'
    }
  }
  const out = fromRoot(options.out)
  rmSync(join(out, 'img'), { recursive: true, force: true })
  for (const side of ['before', 'after'])
    mkdirSync(join(out, 'img', side), { recursive: true })
  for (const change of manifest.changes)
    for (const name of change.images)
      for (const side of ['before', 'after'])
        copyFileSync(
          join(dirs[side], `${name}.jpg`),
          join(out, 'img', side, `${name}.jpg`),
        )
  writeFileSync(
    join(out, 'index.html'),
    buildPanel({
      manifest,
      findings,
      sets,
      before: commitOf(dirs.before),
      after: commitOf(dirs.after),
      date: new Date().toISOString().slice(0, 10),
    }),
  )
  console.log(join(out, 'index.html'))
}

const entry = process.argv[1]
if (entry && fileURLToPath(import.meta.url) === entry) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
