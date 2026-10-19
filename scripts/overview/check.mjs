// Structure and evidence check for docs/SYSTEM_OVERVIEW.md (step 37, R-37-13).
// Pure: takes the markdown text and the repo root, returns one message per problem.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

export const sections = [
  'Architecture',
  'Core functionality',
  'Outside integrations',
  'Data and privacy',
  'Operations',
  'Issues',
  'How to keep this current',
]

// Heading keyword (lower case) per outside service of R-37-04.
export const integrations = [
  { name: 'Discord', keyword: 'discord' },
  { name: 'Nominatim', keyword: 'nominatim' },
  { name: 'OpenFreeMap', keyword: 'openfreemap' },
  { name: 'S3-compatible storage', keyword: 's3' },
  { name: 'Google Maps', keyword: 'google maps' },
  { name: 'Google Images', keyword: 'google images' },
  { name: 'Wikimedia Commons', keyword: 'wikimedia commons' },
  { name: 'GitHub Actions', keyword: 'github actions' },
  { name: 'Deploy host', keyword: 'deploy host' },
]

// Row labels of R-37-05.
export const integrationRows = [
  'Used for',
  'Direction',
  'Code',
  'Config',
  'Auth/keys',
  'Limits and terms',
  'Timeout and failure',
  'Test double',
  'Core rules',
]

export const severities = ['high', 'medium', 'low']
export const categories = [
  'security',
  'privacy',
  'dependency',
  'spec-gap',
  'test-gap',
  'ops',
]
const issueColumns = [
  'ID',
  'Severity',
  'Category',
  'Issue',
  'What could go wrong',
  'Evidence',
  'Suggested fix',
]

export function coreAreaNames(root) {
  return readdirSync(join(root, 'requirements', 'core'))
    .filter((file) => file.endsWith('.md') && !file.startsWith('_'))
    .map((file) => file.replace(/\.md$/, ''))
    .sort()
}

/** Splits markdown into `## ` sections; fenced code is never read as headings. */
function splitByHeading(lines, prefix) {
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

function tableRows(lines) {
  const rows = []
  for (const line of lines) {
    const text = line.trim()
    if (!text.startsWith('|')) continue
    const cells = text
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim())
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue
    rows.push(cells)
  }
  return rows
}

const plain = (cell) => cell.replace(/[*_`]/g, '').trim()

function coreIds(root) {
  const ids = new Set()
  const dir = join(root, 'requirements', 'core')
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md') || file.startsWith('_')) continue
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      const match = /^\|\s*(C-[A-Z]+-\d+)\s*\|/.exec(line)
      if (match) ids.add(match[1])
    }
  }
  return ids
}

function testIds(root) {
  const ids = new Set()
  const dir = join(root, 'requirements')
  for (const file of readdirSync(dir)) {
    if (!/^\d\d-.*\.md$/.test(file)) continue
    const text = readFileSync(join(dir, file), 'utf8')
    for (const match of text.matchAll(/\|\s*(T-\d\d-\d\d)\s*\|/g)) {
      ids.add(match[1])
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

/** References in a cell: `code spans` only. Returns the span texts. */
function spans(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1])
}

function checkReference(ref, context, root, known, problems) {
  if (/^C-[A-Z]+-\d+$/.test(ref)) {
    if (!known.core.has(ref)) {
      problems.push(`${context}: core ID ${ref} is not in requirements/core/`)
    }
    return true
  }
  if (/^T-\d\d-\d\d$/.test(ref)) {
    if (!known.tests.has(ref)) {
      problems.push(`${context}: test ID ${ref} is not in any step file`)
    }
    return true
  }
  const match = /^([A-Za-z0-9_.@/-]+?)(?::(\d+))?$/.exec(ref)
  if (!match || !/[/.]/.test(match[1])) return false
  const [, path, line] = match
  const full = join(root, path)
  if (!existsSync(full)) {
    problems.push(`${context}: evidence path ${path} does not exist`)
    return true
  }
  if (line !== undefined) {
    if (statSync(full).isDirectory()) {
      problems.push(
        `${context}: ${path} is a directory, it has no line ${line}`,
      )
    } else {
      const total = lineCount(full)
      if (Number(line) < 1 || Number(line) > total) {
        problems.push(
          `${context}: line ${line} is past the end of ${path} (${total} lines)`,
        )
      }
    }
  }
  return true
}

/**
 * @param {string} markdown text of docs/SYSTEM_OVERVIEW.md
 * @param {string} root repo root
 * @param {{ coreAreas?: string[] }} [options] injectable core area list
 * @returns {string[]} one message per problem; empty when the document is fine
 */
export function checkOverview(markdown, root, options = {}) {
  const problems = []
  const coreAreas = options.coreAreas ?? coreAreaNames(root)
  const known = { core: coreIds(root), tests: testIds(root) }
  const lines = markdown.split('\n')
  const top = splitByHeading(lines, '## ')

  // R-37-01: summary, date, commit, then the sections in order.
  const firstSection = top[0]?.start ?? lines.length
  const intro = lines.slice(0, firstSection).join('\n')
  if (!/\b\d{4}-\d{2}-\d{2}\b/.test(intro)) {
    problems.push('The summary before the first section names no date')
  }
  if (!/\b[0-9a-f]{7,40}\b/.test(intro)) {
    problems.push('The summary before the first section names no commit')
  }
  let lastIndex = -1
  for (const name of sections) {
    const index = top.findIndex((section) => section.title === name)
    if (index === -1) {
      problems.push(`Missing section "## ${name}"`)
    } else if (index < lastIndex) {
      problems.push(`Section "## ${name}" is out of order`)
    } else {
      lastIndex = index
    }
  }
  const section = (name) => top.find((entry) => entry.title === name)

  // R-37-02: both diagrams.
  const architecture = section('Architecture')
  if (architecture) {
    const text = architecture.lines.join('\n')
    if (!/```mermaid\s*\n\s*flowchart\b/.test(text)) {
      problems.push('Architecture has no mermaid flowchart')
    }
    if (!/```mermaid\s*\n\s*sequenceDiagram\b/.test(text)) {
      problems.push('Architecture has no mermaid sequenceDiagram')
    }
  }

  // R-37-03: one ### per core area, found by the link to its core file.
  const core = section('Core functionality')
  if (core) {
    const subsections = splitByHeading(core.lines, '### ')
    for (const area of coreAreas) {
      const link = `core/${area}.md`
      const found = subsections.some((entry) =>
        entry.lines.some((line) => line.includes(link)),
      )
      if (!found) {
        problems.push(
          `Core area "${area}" has no ### subsection under Core functionality (it must link ${link})`,
        )
      }
    }
  }

  // R-37-04, R-37-05: one ### per outside service, each with the nine rows.
  const outside = section('Outside integrations')
  if (outside) {
    const subsections = splitByHeading(outside.lines, '### ')
    for (const integration of integrations) {
      const found = subsections.find((entry) =>
        entry.title.toLowerCase().includes(integration.keyword),
      )
      if (!found) {
        problems.push(
          `Outside integration "${integration.name}" has no ### subsection`,
        )
        continue
      }
      const rows = tableRows(found.lines)
      const labels = new Set(rows.map((cells) => plain(cells[0] ?? '')))
      for (const label of integrationRows) {
        if (!labels.has(label)) {
          problems.push(
            `Integration "${integration.name}" lacks the row "${label}"`,
          )
        }
      }
      for (const cells of rows) {
        const label = plain(cells[0] ?? '')
        if (label !== 'Code' && label !== 'Core rules') continue
        for (const ref of spans(cells[1] ?? '')) {
          checkReference(
            ref,
            `Integration "${integration.name}", row ${label}`,
            root,
            known,
            problems,
          )
        }
      }
    }
  }

  // R-37-09, R-37-11: the Issues table.
  const issues = section('Issues')
  if (issues) checkIssues(issues.lines, root, known, problems)

  // R-37-12: update triggers and the pnpm test check.
  const keep = section('How to keep this current')
  if (keep) {
    const text = keep.lines.join('\n')
    if (!text.includes('pnpm test')) {
      problems.push('"How to keep this current" does not mention pnpm test')
    }
    if (!/fixed in step/i.test(text)) {
      problems.push(
        '"How to keep this current" does not explain "fixed in step NN"',
      )
    }
  }
  return problems
}

function checkIssues(sectionLines, root, known, problems) {
  const rows = tableRows(sectionLines)
  const header = rows.findIndex((cells) => plain(cells[0] ?? '') === 'ID')
  if (header === -1) {
    problems.push('Issues has no table with an ID column')
    return
  }
  const columns = rows[header].map(plain)
  if (issueColumns.some((name, index) => columns[index] !== name)) {
    problems.push(`Issues table columns must be: ${issueColumns.join(', ')}`)
    return
  }
  const seen = new Set()
  let previous = null
  for (const cells of rows.slice(header + 1)) {
    const id = plain(cells[0] ?? '')
    if (!/^I-\d\d+$/.test(id)) {
      problems.push(`Issues row "${id}": the ID must look like I-01`)
      continue
    }
    const context = `Issue ${id}`
    if (cells.length !== issueColumns.length) {
      problems.push(
        `${context}: expected ${issueColumns.length} cells, found ${cells.length}`,
      )
    }
    if (seen.has(id)) problems.push(`${context}: duplicate ID`)
    seen.add(id)
    const severity = plain(cells[1] ?? '')
    const category = plain(cells[2] ?? '')
    const severityRank = severities.indexOf(severity)
    const categoryRank = categories.indexOf(category)
    if (severityRank === -1) {
      problems.push(
        `${context}: invalid severity "${severity}" (use high, medium or low)`,
      )
    }
    if (categoryRank === -1) {
      problems.push(
        `${context}: invalid category "${category}" (use ${categories.join(', ')})`,
      )
    }
    if (severityRank !== -1 && categoryRank !== -1) {
      if (
        previous &&
        (severityRank < previous.severityRank ||
          (severityRank === previous.severityRank &&
            categoryRank < previous.categoryRank))
      ) {
        problems.push(
          `${context}: out of sort order (${severity}/${category} comes after ${previous.id}, ${previous.severity}/${previous.category}); sort by severity, then category`,
        )
      }
      previous = { id, severity, category, severityRank, categoryRank }
    }
    const evidence = spans(cells[5] ?? '')
    let resolvable = 0
    for (const ref of evidence) {
      if (checkReference(ref, `${context} evidence`, root, known, problems)) {
        resolvable += 1
      } else {
        problems.push(
          `${context} evidence: "${ref}" is not a path, core ID or test ID`,
        )
      }
    }
    if (evidence.length === 0 || resolvable === 0) {
      problems.push(
        `${context}: the Evidence cell holds no reference in backticks`,
      )
    }
  }
  if (seen.size === 0) problems.push('Issues table has no rows')
}

const entry = process.argv[1]
if (entry && fileURLToPath(import.meta.url) === entry) {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
  const file = process.argv[2] ?? join(root, 'docs', 'SYSTEM_OVERVIEW.md')
  const text = readFileSync(file, 'utf8')
  const problems = checkOverview(text, root)
  for (const problem of problems) console.error(problem)
  if (problems.length > 0) process.exit(1)
  console.log('docs/SYSTEM_OVERVIEW.md: ok')
}
