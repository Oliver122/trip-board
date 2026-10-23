// Structure check for docs/MOBILE_SKETCH.md (step 41, R-41-10..R-41-13, R-41-15).
// Pure: takes the markdown text and the repo root, returns one message per problem.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import {
  coreIds,
  plain,
  screens,
  severities,
  splitByHeading,
  tableRows,
} from './check.mjs'
import { findingsRows } from './notes.mjs'

export const sketchSections = [
  'Principles',
  'Shared parts',
  'Screens',
  'Implementation set',
]
export const sharedParts = [
  'Phone header',
  'Page header',
  'Bottom bar',
  'Full-screen sheet',
  'Dialog',
  'Buttons',
  'Text link',
  'Empty and error messages',
]
export const phoneScreens = screens
  .filter((screen) => screen.widths.includes(390))
  .map((screen) => screen.id)
export const frameWidth = 36
export const maxLines = 50
export const maxSetIds = 6

const setColumns = [
  'Set',
  'Title',
  'U- IDs',
  'Screens',
  'Core rules',
  'Depends on',
]
const requiredPrinciples = ['C-APP-25', 'C-APP-35', 'C-APP-36']
const localePath = 'apps/web/src/locales/de/common.json'
const report = 'docs/UI_REVIEW.md'

/** The fenced blocks of some lines, with their content lines. */
function fences(lines) {
  const blocks = []
  let current = null
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (current) {
        blocks.push(current)
        current = null
      } else {
        current = []
      }
    } else if (current) {
      current.push(line)
    }
  }
  return blocks
}

/** The lines outside fenced blocks. */
function outsideFences(lines) {
  const kept = []
  let fenced = false
  for (const line of lines) {
    if (line.startsWith('```')) fenced = !fenced
    else if (!fenced) kept.push(line)
  }
  return kept
}

function stringValues(value, found = []) {
  if (typeof value === 'string') found.push(value)
  else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) stringValues(child, found)
  }
  return found
}

/**
 * @param {string} markdown text of docs/MOBILE_SKETCH.md
 * @param {{ root: string, reportMarkdown: string }} options repo root; text of docs/UI_REVIEW.md
 * @returns {string[]} one message per problem
 */
export function checkSketch(markdown, { root, reportMarkdown }) {
  const problems = []
  const rows = findingsRows(reportMarkdown)
  const severityOf = new Map(rows.map((row) => [row.id, row.severity]))
  const coreSet = coreIds(root)
  const top = splitByHeading(markdown.split('\n'), '## ')
  const section = (name) => top.find((entry) => entry.title === name)

  let lastIndex = -1
  for (const name of sketchSections) {
    const index = top.findIndex((entry) => entry.title === name)
    if (index === -1) {
      problems.push(`Missing section "## ${name}"`)
    } else if (index < lastIndex) {
      problems.push(`Section "## ${name}" is out of order`)
    } else {
      lastIndex = index
    }
  }

  const checkUIds = (ids, context) => {
    for (const id of ids) {
      if (!severityOf.has(id)) {
        problems.push(`${context}: ${id} is not in ${report} Findings`)
      }
    }
  }

  // Principles: the phone rules it keeps.
  const principles = section('Principles')
  if (principles) {
    const text = principles.lines.join('\n')
    for (const id of requiredPrinciples) {
      if (!text.includes(id)) problems.push(`Principles do not name ${id}`)
    }
    for (const id of new Set(text.match(/\bC-[A-Z]+-\d+\b/g) ?? [])) {
      if (!coreSet.has(id)) {
        problems.push(`Principles: core ID ${id} is not in requirements/core/`)
      }
    }
  }

  // Shared parts and Screens: order, fields and wireframes.
  const checkWireframe = (lines, context) => {
    if (lines.length === 0) {
      problems.push(`${context} wireframe is empty`)
      return
    }
    const first = [...lines[0]].length
    if (first !== frameWidth) {
      problems.push(
        `${context} wireframe is ${first} columns wide, the frame must be ${frameWidth}`,
      )
    }
    lines.forEach((line, index) => {
      const width = [...line].length
      if (width > frameWidth) {
        problems.push(
          `${context} wireframe line ${index + 1} is ${width} columns, at most ${frameWidth}`,
        )
      }
    })
    if (lines.length > maxLines) {
      problems.push(
        `${context} wireframe has ${lines.length} lines, at most ${maxLines}`,
      )
    }
  }
  const checkOrder = (blocks, expected, label) => {
    let last = -1
    for (const title of expected) {
      const index = blocks.findIndex((block) => block.title === title)
      if (index === -1) {
        problems.push(`${label} "${title}" is missing`)
      } else if (index < last) {
        problems.push(`${label} "${title}" is out of order`)
      } else {
        last = index
      }
    }
    for (const block of blocks) {
      if (!expected.includes(block.title)) {
        problems.push(`${label} "${block.title}" is not in the list`)
      }
    }
  }
  const field = (lines, label) => {
    const prefix = `${label}:`
    const line = lines.find((entry) => entry.startsWith(prefix))
    return line === undefined ? null : line.slice(prefix.length).trim()
  }
  const checkFixes = (lines, context) => {
    const fixes = field(outsideFences(lines), 'Fixes')
    if (fixes === null) {
      problems.push(`${context} has no Fixes: line`)
      return
    }
    if (fixes === '—') return
    const ids = fixes.split(',').map((id) => id.trim())
    if (ids.some((id) => !/^U-\d\d+$/.test(id))) {
      problems.push(`${context}: Fixes: "${fixes}" must be U- IDs or —`)
      return
    }
    for (const id of ids) {
      if (!severityOf.has(id)) {
        problems.push(`${context}: Fixes: ${id} is not in ${report} Findings`)
      }
    }
  }
  const checkFences = (lines, context) => {
    const blocks = fences(lines)
    if (blocks.length !== 1) {
      problems.push(
        `${context} needs exactly one wireframe, found ${blocks.length}`,
      )
    }
    for (const block of blocks) checkWireframe(block, context)
  }

  const shared = section('Shared parts')
  if (shared) {
    const parts = splitByHeading(shared.lines, '### ')
    checkOrder(parts, sharedParts, 'Shared part')
    for (const part of parts) {
      const context = `Shared part "${part.title}"`
      checkFences(part.lines, context)
      checkFixes(part.lines, context)
    }
  }

  const screensSection = section('Screens')
  if (screensSection) {
    const blocks = splitByHeading(screensSection.lines, '### ')
    checkOrder(blocks, phoneScreens, 'Screen')
    let labels = null
    for (const block of blocks) {
      const context = `Screen "${block.title}"`
      const lines = outsideFences(block.lines)
      const wanted = `ui-review/notes/${block.title}-390-light.md`
      const today = field(lines, 'Today')
      if (today === null) {
        problems.push(`${context} has no Today: line`)
      } else if (!today.includes(`](${wanted})`)) {
        problems.push(`${context}: Today: must link ${wanted}`)
      } else if (!existsSync(join(root, 'docs', wanted))) {
        problems.push(`${context}: Today: docs/${wanted} does not exist`)
      }
      checkFences(block.lines, context)
      checkFixes(block.lines, context)

      const changes = lines.findIndex((line) => line.startsWith('Changes:'))
      if (changes === -1) {
        problems.push(`${context} has no Changes: line`)
      } else {
        let bullets = 0
        for (const line of lines.slice(changes + 1)) {
          if (bullets === 0 && line.trim() === '') continue
          if (!line.startsWith('- ')) break
          bullets += 1
        }
        if (bullets === 0) problems.push(`${context}: Changes: has no bullets`)
      }

      const label = field(lines, 'Longest German label')
      const value = (label ?? '')
        .replace(/^["'`“”„‘’]+|["'`“”„‘’]+$/g, '')
        .trim()
      if (label === null || value === '') {
        problems.push(`${context} has no Longest German label:`)
      } else {
        if (labels === null) {
          const file = join(root, localePath)
          labels = existsSync(file)
            ? stringValues(JSON.parse(readFileSync(file, 'utf8')))
            : []
        }
        if (!labels.some((text) => text.includes(value))) {
          problems.push(
            `${context}: Longest German label "${value}" is not in ${localePath}`,
          )
        }
      }
    }
  }

  // Implementation set: the table and the later: lines.
  const implementation = section('Implementation set')
  if (implementation) {
    const outside = outsideFences(implementation.lines)
    const table = tableRows(outside)
    const header = table[0]?.map(plain) ?? []
    const sets = []
    if (header.join('|') !== setColumns.join('|')) {
      problems.push(
        `Implementation set columns must be: ${setColumns.join(', ')}`,
      )
    } else {
      let previous = null
      table.slice(1).forEach((cells, index) => {
        const id = plain(cells[0] ?? '')
        const expected = `S-${String(index + 1).padStart(2, '0')}`
        if (id !== expected) {
          problems.push(
            `Set IDs must run S-01, S-02, … without gaps, found "${id}" where ${expected} is expected`,
          )
        }
        const context = `Set ${id}`
        if (cells.length !== setColumns.length) {
          problems.push(
            `${context}: expected ${setColumns.length} cells, found ${cells.length}`,
          )
          return
        }
        const ids = [...new Set(cells[2].match(/\bU-\d+\b/g) ?? [])]
        sets.push({ id, ids })
        if (ids.length > maxSetIds) {
          problems.push(
            `${context} has ${ids.length} U- IDs, at most ${maxSetIds}`,
          )
        }
        checkUIds(ids, context)
        for (const screen of cells[3].matchAll(/`([^`]+)`/g)) {
          if (!phoneScreens.includes(screen[1])) {
            problems.push(`${context}: unknown screen "${screen[1]}"`)
          }
        }
        const core = cells[4].trim()
        if (core !== '—') {
          const coreList = core.match(/\bC-[A-Z]+-\d+\b/g) ?? []
          if (coreList.length === 0) {
            problems.push(`${context}: Core rules must be C- IDs or —`)
          }
          for (const coreId of coreList) {
            if (!coreSet.has(coreId)) {
              problems.push(
                `${context}: core ID ${coreId} is not in requirements/core/`,
              )
            }
          }
        }
        const depends = cells[5].trim()
        if (depends !== '—') {
          for (const dependency of depends
            .split(',')
            .map((entry) => entry.trim())) {
            const position = Number(/^S-(\d\d+)$/.exec(dependency)?.[1] ?? NaN)
            if (!(position >= 1 && position <= index)) {
              problems.push(
                `${context}: Depends on "${dependency}" must be an earlier set (S-NN) or —`,
              )
            }
          }
        }
        const ranks = ids
          .map((uid) => severities.indexOf(severityOf.get(uid)))
          .filter((rank) => rank !== -1)
        if (ranks.length > 0) {
          const rank = Math.min(...ranks)
          if (previous && rank < previous.rank) {
            problems.push(
              `${context}: highest severity ${severities[rank]} comes after ${previous.id} with ${severities[previous.rank]}; order sets so the highest severity never increases`,
            )
          }
          previous = { id, rank }
        }
      })
    }

    const later = new Map()
    for (const line of outside) {
      const match = /^later:\s*(U-\d+)\b\s*(.*)$/.exec(line.trim())
      if (!match) continue
      if (match[2].trim() === '') {
        problems.push(`later: ${match[1]} has no reason`)
      }
      checkUIds([match[1]], `later: ${match[1]}`)
      later.set(match[1], match[2])
    }
    for (const row of rows) {
      if (!row.widths.includes('390')) continue
      const places = [
        ...sets.filter((set) => set.ids.includes(row.id)).map((set) => set.id),
        ...(later.has(row.id) ? ['a later: line'] : []),
      ]
      if (places.length === 0) {
        problems.push(`${row.id} (390 px) is in no set and no later: line`)
      } else if (places.length > 1) {
        problems.push(`${row.id} is in ${places.join(' and ')}`)
      }
    }
  }
  return problems
}

/** R-41-13: DESIGN.md links the sketch. */
export function checkSketchLinks(root) {
  const path = join(root, 'docs', 'DESIGN.md')
  const design = existsSync(path) ? readFileSync(path, 'utf8') : null
  return design !== null && /\]\([^)]*MOBILE_SKETCH\.md/.test(design)
    ? []
    : ['docs/DESIGN.md does not link MOBILE_SKETCH.md']
}

const entry = process.argv[1]
if (entry && fileURLToPath(import.meta.url) === entry) {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
  const problems = [
    ...checkSketch(
      readFileSync(join(root, 'docs', 'MOBILE_SKETCH.md'), 'utf8'),
      {
        root,
        reportMarkdown: readFileSync(
          join(root, 'docs', 'UI_REVIEW.md'),
          'utf8',
        ),
      },
    ),
    ...checkSketchLinks(root),
  ]
  for (const problem of problems) console.error(problem)
  if (problems.length > 0) process.exit(1)
  console.log('docs/MOBILE_SKETCH.md: ok')
}
