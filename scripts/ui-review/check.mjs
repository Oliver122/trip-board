// Structure and evidence check for docs/UI_REVIEW.md (step 40, R-40-14).
// Pure: takes the markdown text and the repo root, returns one message per problem.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

// The screens of R-40-02 in order, with the widths each is shown at.
export const screens = [
  { id: 'login', widths: [1280, 768, 390] },
  { id: 'trips', widths: [1280, 768, 390] },
  { id: 'board-map', widths: [1280, 768, 390] },
  { id: 'board-list', widths: [390] },
  { id: 'spot-panel', widths: [1280, 768, 390] },
  { id: 'add-spot', widths: [1280, 768, 390] },
  { id: 'schedule', widths: [1280, 768, 390] },
  { id: 'trip-settings', widths: [1280, 768, 390] },
  { id: 'members', widths: [1280, 768, 390] },
  { id: 'export', widths: [1280, 768] },
  { id: 'more-sheet', widths: [390] },
  { id: 'account', widths: [1280, 768, 390] },
  { id: 'join-invalid', widths: [1280, 768, 390] },
  { id: 'not-found', widths: [1280, 768, 390] },
  { id: 'admin-dashboard', widths: [1280, 768, 390] },
  { id: 'admin-users', widths: [1280, 768, 390] },
]

export const widths = [1280, 768, 390]
export const sections = [
  'Screens',
  'Automated findings',
  'Findings',
  'Mobile',
  'How to repeat',
]
export const severities = ['high', 'medium', 'low']
export const categories = [
  'mobile',
  'layout',
  'touch',
  'text',
  'i18n',
  'visual',
  'state',
  'consistency',
]
export const mobileTopics = [
  'Bottom bar and safe area',
  'Header and trip name truncation',
  'Spot panel sections',
  'Dialogs and sheets at 390×844',
  'German labels at 390 px',
  'Touch targets',
  'Horizontal scroll',
  'Loading, empty and error states',
  'Dark theme beyond axe',
  'Admin and export notices',
]
export const maxFileBytes = 300 * 1024

const checkNames = [
  'overflow-x',
  'target-size',
  'offscreen',
  'clipped-text',
  'truncated-no-full-text',
  'overlap',
  'small-text',
]
const findingColumns = [
  'ID',
  'Severity',
  'Category',
  'Screen',
  'Widths',
  'Issue',
  'Evidence',
  'Suggested fix',
  'Step',
]
const dir = 'docs/ui-review'

/** Splits markdown into `## ` sections; fenced code is never read as headings. */
export function splitByHeading(lines, prefix) {
  const blocks = []
  let fenced = false
  lines.forEach((line, index) => {
    if (line.startsWith('```')) fenced = !fenced
    if (!fenced && line.startsWith(prefix) && !line.startsWith(`${prefix}#`)) {
      blocks.push({
        title: line.slice(prefix.length).trim(),
        start: index,
        lines: [],
      })
    } else if (blocks.length > 0) {
      blocks[blocks.length - 1].lines.push(line)
    }
  })
  return blocks
}

export function tableRows(lines) {
  const rows = []
  for (const line of lines) {
    const text = line.trim()
    if (!text.startsWith('|')) continue
    const cells = text
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replaceAll('\\|', '|'))
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue
    rows.push(cells)
  }
  return rows
}

export const plain = (cell) => cell.replace(/[*_`]/g, '').trim()

export function coreIds(root) {
  const ids = new Set()
  const coreDir = join(root, 'requirements', 'core')
  for (const file of readdirSync(coreDir)) {
    if (!file.endsWith('.md') || file.startsWith('_')) continue
    for (const line of readFileSync(join(coreDir, file), 'utf8').split('\n')) {
      const match = /^\|\s*(C-[A-Z]+-\d+)\s*\|/.exec(line)
      if (match) ids.add(match[1])
    }
  }
  return ids
}

function lineCount(path) {
  const text = readFileSync(path, 'utf8')
  return text.endsWith('\n')
    ? text.split('\n').length - 1
    : text.split('\n').length
}

function checkPath(token, context, root, problems) {
  const match = /^(.+?)(?::(\d+))?$/.exec(token)
  const [, path, line] = match
  const full = join(root, path)
  if (!existsSync(full)) {
    problems.push(`${context}: evidence path ${path} does not exist`)
    return
  }
  if (line === undefined) return
  if (statSync(full).isDirectory()) {
    problems.push(`${context}: ${path} is a directory, it has no line ${line}`)
    return
  }
  const total = lineCount(full)
  if (Number(line) < 1 || Number(line) > total) {
    problems.push(
      `${context}: line ${line} is past the end of ${path} (${total} lines)`,
    )
  }
}

const pathToken =
  /^(?:(?:apps|packages|e2e|scripts|docs|requirements|\.github)\/|[A-Za-z][\w.-]*\.(?:md|json|ts|tsx|mjs|yml|yaml|sh)(?::\d+)?$)[\w.@/-]*(?::\d+)?$/

/** Screenshot files a cell cites, as links to ui-review/<file>.jpg or as docs/ui-review/<file>.jpg text. */
export function citedScreenshots(cell) {
  const files = new Set()
  for (const match of cell.matchAll(/\]\((?:\.\/)?ui-review\/([^)\s]+)\)/g)) {
    files.add(match[1])
  }
  for (const match of cell.matchAll(/docs\/ui-review\/([\w.-]+)/g)) {
    files.add(match[1])
  }
  return files
}

/**
 * @param {string} markdown text of docs/UI_REVIEW.md
 * @param {{ root: string, docsDir?: string }} options repo root; screenshots and findings.json directory
 * @returns {string[]} one message per problem; empty when the report is fine
 */
export function checkReport(markdown, { root, docsDir }) {
  const problems = []
  const dirPath = docsDir ?? join(root, 'docs', 'ui-review')
  const coreSet = coreIds(root)
  const lines = markdown.split('\n')
  const top = splitByHeading(lines, '## ')
  const section = (name) => top.find((entry) => entry.title === name)

  let findings = null
  const findingsPath = join(dirPath, 'findings.json')
  if (!existsSync(findingsPath)) {
    problems.push(`${dir}/findings.json does not exist`)
  } else {
    try {
      findings = JSON.parse(readFileSync(findingsPath, 'utf8'))
    } catch {
      problems.push(`${dir}/findings.json is not valid JSON`)
    }
  }
  const groups = findings?.groups ?? []
  const keys = new Set(groups.map((group) => group.key))

  // R-40-07: the summary, then the sections in order.
  const firstSection = top[0]?.start ?? lines.length
  const intro = lines.slice(0, firstSection)
  const summaryLine = (label) => {
    const prefix = `- ${label}:`
    const line = intro.find((entry) => entry.startsWith(prefix))
    return line === undefined ? null : line.slice(prefix.length).trim()
  }
  const date = summaryLine('Date')
  if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    problems.push('Summary line "- Date: YYYY-MM-DD" is missing or malformed')
  }
  const commit = summaryLine('Commit')
  const commitId =
    commit === null ? null : /^[0-9a-f]{7,40}\b/.exec(commit)?.[0]
  if (commitId === null || commitId === undefined) {
    problems.push('Summary line "- Commit: <id>" is missing or malformed')
  } else if (findings && commitId !== findings.commit) {
    problems.push(
      `Summary commit ${commitId} differs from the commit ${findings.commit} of ${dir}/findings.json`,
    )
  }
  const numberLine = (label, expected, expectedFrom) => {
    const value = summaryLine(label)
    if (value === null || !/^\d+$/.test(value)) {
      problems.push(`Summary line "- ${label}: N" is missing or malformed`)
    } else if (expected !== undefined && Number(value) !== expected) {
      problems.push(
        `Summary ${label} is ${value}, ${expectedFrom} says ${expected}`,
      )
    }
  }
  numberLine('Screens', screens.length, 'the screen list')
  numberLine('Screenshots', findings?.screenshots, 'findings.json')
  numberLine(
    'Automated groups',
    findings ? groups.length : undefined,
    'findings.json',
  )

  let lastIndex = -1
  for (const name of sections) {
    const index = top.findIndex((entry) => entry.title === name)
    if (index === -1) {
      problems.push(`Missing section "## ${name}"`)
    } else if (index < lastIndex) {
      problems.push(`Section "## ${name}" is out of order`)
    } else {
      lastIndex = index
    }
  }

  const findingsSection = section('Findings')
  const findingIds = new Set()
  const rowsByScreen390 = new Set()
  const citedFiles = new Set()
  if (findingsSection) {
    checkFindings(findingsSection.lines)
  }

  function checkFindings(sectionLines) {
    const rows = tableRows(sectionLines)
    const header = rows.findIndex((cells) => plain(cells[0] ?? '') === 'ID')
    if (header === -1) {
      problems.push('Findings has no table with an ID column')
      return
    }
    const columns = rows[header].map(plain)
    if (
      columns.length !== findingColumns.length ||
      findingColumns.some((name, index) => columns[index] !== name)
    ) {
      problems.push(
        `Findings table columns must be: ${findingColumns.join(', ')}`,
      )
      return
    }
    const body = rows.slice(header + 1)
    if (body.length === 0) problems.push('Findings table has no rows')
    let previous = null
    body.forEach((cells, index) => {
      const id = plain(cells[0] ?? '')
      if (!/^U-\d\d+$/.test(id)) {
        problems.push(
          `Findings row ${index + 1}: the ID "${id}" must look like U-01`,
        )
        return
      }
      const context = `Finding ${id}`
      if (cells.length !== findingColumns.length) {
        problems.push(
          `${context}: expected ${findingColumns.length} cells, found ${cells.length}`,
        )
      }
      if (findingIds.has(id)) problems.push(`${context}: duplicate ID`)
      findingIds.add(id)

      const severity = plain(cells[1] ?? '')
      const category = plain(cells[2] ?? '')
      const rank = severities.indexOf(severity)
      if (rank === -1) {
        problems.push(
          `${context}: invalid severity "${severity}" (use high, medium or low)`,
        )
      }
      if (!categories.includes(category)) {
        problems.push(
          `${context}: invalid category "${category}" (use ${categories.join(', ')})`,
        )
      }
      if (rank !== -1) {
        if (
          previous &&
          (rank < previous.rank ||
            (rank === previous.rank &&
              Number(id.slice(2)) < Number(previous.id.slice(2))))
        ) {
          problems.push(
            `${context}: out of sort order (${severity} comes after ${previous.id}, ${previous.severity}); sort by severity, then ID`,
          )
        }
        previous = { id, severity, rank }
      }

      const screenIds = [...(cells[3] ?? '').matchAll(/`([^`]+)`/g)].map(
        (match) => match[1],
      )
      if (screenIds.length === 0) {
        problems.push(
          `${context}: the Screen cell names no screen id in backticks`,
        )
      }
      for (const screen of screenIds) {
        if (!screens.some((entry) => entry.id === screen)) {
          problems.push(`${context}: unknown screen "${screen}"`)
        }
      }
      const rowWidths = (cells[4] ?? '')
        .split(',')
        .map((width) => width.trim())
        .filter(Boolean)
      if (
        rowWidths.length === 0 ||
        rowWidths.some((width) => !widths.includes(Number(width)))
      ) {
        problems.push(
          `${context}: Widths "${cells[4] ?? ''}" must be a comma-separated subset of ${widths.join(', ')}`,
        )
      }
      if (rowWidths.includes('390')) {
        for (const screen of screenIds) rowsByScreen390.add(screen)
      }

      const step = (cells[8] ?? '').trim()
      if (!/^(—|step \d\d+|fixed in step \d\d+)$/.test(step)) {
        problems.push(
          `${context}: invalid Step "${step}" (use —, step NN or fixed in step NN)`,
        )
      }

      checkEvidence(cells[6] ?? '', context)
    })
    // IDs, sorted numerically, must be exactly U-01..U-NN.
    const numbers = [...findingIds].map((id) => Number(id.slice(2)))
    for (let n = 1; n <= Math.max(0, ...numbers); n += 1) {
      if (!numbers.includes(n)) {
        problems.push(
          `Findings IDs must run U-01..U-NN without gaps, U-${String(n).padStart(2, '0')} is missing`,
        )
      }
    }
  }

  function checkEvidence(cell, context) {
    const files = citedScreenshots(cell)
    if (files.size === 0) {
      problems.push(`${context}: the Evidence cell cites no screenshot`)
    }
    for (const file of files) {
      citedFiles.add(file)
      if (!existsSync(join(dirPath, file))) {
        problems.push(
          `Cited screenshot ${dir}/${file} does not exist (${context.replace('Finding ', '')})`,
        )
      }
    }
    for (const id of cell.match(/\bC-[A-Z]+-\d+\b/g) ?? []) {
      if (!coreSet.has(id)) {
        problems.push(`${context}: core ID ${id} is not in requirements/core/`)
      }
    }
    // Automated keys, paths and line references are what is left of the cell.
    let rest = cell.replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    for (const span of [...cell.matchAll(/`([^`]+)`/g)].map(
      (match) => match[1],
    )) {
      if (keys.has(span)) {
        rest = rest.replace(`\`${span}\``, ' ')
      } else if (
        checkNames.includes(span.split('/')[0]) &&
        span.includes('/')
      ) {
        problems.push(
          `${context}: evidence key \`${span}\` is not a group of ${dir}/findings.json`,
        )
        rest = rest.replace(`\`${span}\``, ' ')
      }
    }
    for (const token of rest.match(/[\w.@/:-]+/g) ?? []) {
      const cleaned = token.replace(/[.:]+$/, '')
      if (
        pathToken.test(cleaned) &&
        !cleaned.startsWith(`${dir}/`) &&
        !/^C-/.test(cleaned)
      ) {
        checkPath(cleaned, context, root, problems)
      }
    }
  }

  // R-40-08: the Screens table.
  const screensSection = section('Screens')
  if (screensSection) {
    const rows = tableRows(screensSection.lines)
    const header = rows[0]?.map(plain) ?? []
    if (header.join('|') !== ['Screen', ...widths].join('|')) {
      problems.push(
        `Screens table columns must be: Screen | ${widths.join(' | ')}`,
      )
    }
    const seen = new Set()
    for (const cells of rows.slice(1)) {
      const id = plain(cells[0] ?? '')
      const screen = screens.find((entry) => entry.id === id)
      if (!screen) {
        problems.push(`Screens row "${id}" is not a screen of the screen list`)
        continue
      }
      if (seen.has(id)) problems.push(`Screens row "${id}" appears twice`)
      seen.add(id)
      widths.forEach((width, index) => {
        const cell = (cells[index + 1] ?? '').trim()
        if (!screen.widths.includes(width)) {
          if (cell !== '—') {
            problems.push(
              `Screens: "${id}" is not shown at ${width}, its cell must be —, not "${cell}"`,
            )
          }
          return
        }
        if (!/^\d+$/.test(cell)) {
          problems.push(
            `Screens: "${id}" at ${width} must be a number, not "${cell}"`,
          )
          return
        }
        if (findings) {
          const count = groups.filter(
            (group) =>
              group.screen === id &&
              group.occurrences.some((entry) => entry.startsWith(`${width}-`)),
          ).length
          if (Number(cell) !== count) {
            problems.push(
              `Screens: "${id}" at ${width} says ${cell}, findings.json has ${count} groups`,
            )
          }
        }
      })
    }
    const expectedOrder = screens.map((entry) => entry.id)
    for (const id of expectedOrder) {
      if (!seen.has(id)) problems.push(`Screens has no row for "${id}"`)
    }
    const order = rows
      .slice(1)
      .map((cells) => plain(cells[0] ?? ''))
      .filter((id) => expectedOrder.includes(id))
    if (
      seen.size === expectedOrder.length &&
      order.join() !== expectedOrder.join()
    ) {
      problems.push(
        `Screens rows are out of order, use: ${expectedOrder.join(', ')}`,
      )
    }
  }

  // R-40-09: the Automated findings table.
  const automated = section('Automated findings')
  if (automated) {
    const rows = tableRows(automated.lines)
    const header = rows[0]?.map(plain) ?? []
    if (header.join('|') !== 'Key|Where|Element|Finding') {
      problems.push(
        'Automated findings columns must be: Key, Where, Element, Finding',
      )
    } else {
      const rowKeys = new Set()
      for (const cells of rows.slice(1)) {
        const key = (cells[0] ?? '').replace(/^`|`$/g, '')
        if (rowKeys.has(key))
          problems.push(`Automated findings key ${key} appears twice`)
        rowKeys.add(key)
        if (findings && !keys.has(key)) {
          problems.push(
            `Automated findings row \`${key}\` is not a group of ${dir}/findings.json`,
          )
        }
        for (const file of citedScreenshots(cells.join(' | '))) {
          citedFiles.add(file)
          if (!existsSync(join(dirPath, file))) {
            problems.push(
              `Cited screenshot ${dir}/${file} does not exist (${key})`,
            )
          }
        }
        const finding = (cells[3] ?? '').trim()
        if (finding.startsWith('accepted:')) {
          if (finding.slice('accepted:'.length).trim() === '') {
            problems.push(`Automated finding ${key}: accepted: has no reason`)
          }
        } else {
          const ids = finding.split(/[,\s]+/).filter(Boolean)
          if (ids.length === 0 || ids.some((id) => !/^U-\d\d+$/.test(id))) {
            problems.push(
              `Automated finding ${key}: "${finding}" must be a U- ID or accepted: <reason>`,
            )
          } else if (findingsSection) {
            for (const id of ids) {
              if (!findingIds.has(id)) {
                problems.push(
                  `Automated finding ${key}: ${id} is not in the Findings table`,
                )
              }
            }
          }
        }
      }
      for (const key of keys) {
        if (!rowKeys.has(key)) {
          problems.push(
            `Group ${key} of ${dir}/findings.json has no Automated findings row`,
          )
        }
      }
    }
  }

  // R-40-11: the files in docs/ui-review/.
  if (existsSync(dirPath)) {
    for (const file of readdirSync(dirPath).sort()) {
      const full = join(dirPath, file)
      if (statSync(full).isDirectory() || file === 'findings.json') continue
      if (findingsSection && !citedFiles.has(file)) {
        problems.push(`File ${dir}/${file} is not cited by any finding`)
      }
      const size = statSync(full).size
      if (size > maxFileBytes) {
        problems.push(
          `File ${dir}/${file} is ${Math.ceil(size / 1024)} kB, over ${maxFileBytes / 1024} kB`,
        )
      }
    }
  }

  // R-40-12: one line per phone topic.
  const mobile = section('Mobile')
  const fineScreens = new Set()
  if (mobile) {
    const found = new Map()
    for (const line of mobile.lines) {
      const match = /^-\s+\*\*(.+?):\*\*\s*(.*)$/.exec(line.trim())
      if (!match) continue
      found.set(match[1].trim(), match[2].trim())
      if (/\bfine:/.test(match[2])) {
        for (const id of match[2].matchAll(/`([^`]+)`/g)) fineScreens.add(id[1])
      }
    }
    for (const topic of mobileTopics) {
      const value = found.get(topic)
      if (value === undefined) {
        problems.push(`Mobile topic "${topic}" is missing`)
        continue
      }
      const ids = value.match(/\bU-\d+\b/g) ?? []
      const fine = /\bfine:\s*(.*)$/.exec(value)
      if (ids.length === 0 && !fine) {
        problems.push(
          `Mobile topic "${topic}" has no U- ID and no fine: <reason>`,
        )
      } else if (ids.length === 0 && fine[1].trim() === '') {
        problems.push(`Mobile topic "${topic}": fine: has no reason`)
      }
      for (const id of ids) {
        if (findingsSection && !findingIds.has(id)) {
          problems.push(
            `Mobile topic "${topic}": ${id} is not in the Findings table`,
          )
        }
      }
    }
    for (const label of found.keys()) {
      if (!mobileTopics.includes(label)) {
        problems.push(`Mobile has an unknown topic "${label}"`)
      }
    }
    if (findingsSection) {
      for (const screen of screens.filter((entry) =>
        entry.widths.includes(390),
      )) {
        if (!rowsByScreen390.has(screen.id) && !fineScreens.has(screen.id)) {
          problems.push(
            `Screen "${screen.id}" shown at 390 px is in no Findings row with 390 in Widths and in no Mobile fine: line`,
          )
        }
      }
    }
  }

  // R-40-13: how to repeat.
  const repeat = section('How to repeat')
  if (repeat) {
    const text = repeat.lines.join('\n')
    if (!text.includes('pnpm ui:review')) {
      problems.push('"How to repeat" does not mention pnpm ui:review')
    }
    if (!text.includes('--docs')) {
      problems.push('"How to repeat" does not mention --docs')
    }
    if (!/fixed in step/i.test(text)) {
      problems.push('"How to repeat" does not explain "fixed in step NN"')
    }
  }
  return problems
}

/** R-40-15: README lists the command and DESIGN.md links the report. */
export function checkLinks(root) {
  const problems = []
  const read = (file) => {
    const path = join(root, file)
    return existsSync(path) ? readFileSync(path, 'utf8') : null
  }
  const readme = read('README.md')
  if (readme === null || !readme.includes('pnpm ui:review')) {
    problems.push('README.md does not mention pnpm ui:review')
  }
  const design = read('docs/DESIGN.md')
  if (design === null || !/\]\([^)]*UI_REVIEW\.md/.test(design)) {
    problems.push('docs/DESIGN.md does not link UI_REVIEW.md')
  }
  return problems
}

const entry = process.argv[1]
if (entry && fileURLToPath(import.meta.url) === entry) {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
  const file = process.argv[2] ?? join(root, 'docs', 'UI_REVIEW.md')
  const problems = [
    ...checkReport(readFileSync(file, 'utf8'), { root }),
    ...checkLinks(root),
  ]
  for (const problem of problems) console.error(problem)
  if (problems.length > 0) process.exit(1)
  console.log('docs/UI_REVIEW.md: ok')
}
