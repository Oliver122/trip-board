// Format and merge check for docs/ui-review/notes/*.md (step 41, R-41-04, R-41-14).
// Pure: takes the note texts and the report markdown, returns one message per problem.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import {
  categories,
  citedScreenshots,
  plain,
  screens,
  severities,
  splitByHeading,
  tableRows,
  widths,
} from './check.mjs'

const notesPath = 'docs/ui-review/notes'
const noteSections = ['Seen', 'Problems', 'Raw checks']
const problemColumns = ['#', 'Severity', 'Category', 'Issue', 'Where', 'Known']

/** The image names of the screen list, in the order of R-41-02. */
export function imageNames() {
  const names = []
  for (const screen of screens) {
    for (const width of widths) {
      if (!screen.widths.includes(width)) continue
      names.push(`${screen.id}-${width}-light`, `${screen.id}-${width}-dark`)
      if (width === 390) names.push(`${screen.id}-${width}-light-de`)
    }
  }
  return names
}

/** `{ screen, width, theme, locale }` for a valid image name, otherwise null. */
export function parseImage(name) {
  const match = /^(.+)-(1280|768|390)-(light|dark)(-de)?$/.exec(name)
  if (!match) return null
  const [, id, width, theme, de] = match
  const screen = screens.find((entry) => entry.id === id)
  if (!screen || !screen.widths.includes(Number(width))) return null
  if (de && (width !== '390' || theme !== 'light')) return null
  return {
    screen: id,
    width: Number(width),
    theme,
    locale: de ? 'de' : 'en',
  }
}

/** The rows of the Findings table of docs/UI_REVIEW.md. */
export function findingsRows(markdown) {
  const top = splitByHeading(markdown.split('\n'), '## ')
  const section = top.find((entry) => entry.title === 'Findings')
  if (!section) return []
  const rows = tableRows(section.lines)
  const header = rows.findIndex((cells) => plain(cells[0] ?? '') === 'ID')
  if (header === -1) return []
  return rows
    .slice(header + 1)
    .map((cells) => ({
      id: plain(cells[0] ?? ''),
      severity: plain(cells[1] ?? ''),
      screens: [...(cells[3] ?? '').matchAll(/`([^`]+)`/g)].map(
        (match) => match[1],
      ),
      widths: (cells[4] ?? '')
        .split(',')
        .map((width) => width.trim())
        .filter(Boolean),
      evidence: cells[6] ?? '',
    }))
    .filter((row) => /^U-\d\d+$/.test(row.id))
}

/** Note names a Findings Evidence cell cites, as docs/ui-review/notes/<image>.md or a ui-review/notes/ link. */
export function citedNotes(cell) {
  const files = new Set()
  for (const match of cell.matchAll(
    /\]\((?:\.\/)?ui-review\/notes\/([^)\s]+\.md)\)/g,
  )) {
    files.add(match[1])
  }
  for (const match of cell.matchAll(/docs\/ui-review\/notes\/([\w.-]+\.md)/g)) {
    files.add(match[1])
  }
  return files
}

/** The Known cells of the problem rows of one note (rows that parse; format errors are checkNote's job). */
export function problemKnowns(text) {
  const top = splitByHeading(text.split('\n'), '## ')
  const section = top.find((entry) => entry.title === 'Problems')
  if (!section) return []
  const rows = tableRows(section.lines)
  if (rows.length < 2) return []
  return rows.slice(1).map((cells) => (cells[5] ?? '').trim())
}

/**
 * @param {string} name image name, the note's file name without .md
 * @param {string} text the note
 * @param {{ findingIds?: Set<string>, allowNew?: boolean }} options U- IDs of the Findings table; whether `new` is still allowed
 * @returns {string[]} one message per problem
 */
export function checkNote(name, text, { findingIds, allowNew = false } = {}) {
  const problems = []
  const where = `${notesPath}/${name}.md`
  const fail = (message) => problems.push(`${where}: ${message}`)
  const image = parseImage(name)
  if (image === null) {
    fail('not <screen>-<width>-<light|dark>[-de] for a known screen and width')
    return problems
  }

  const lines = text.split('\n')
  const top = splitByHeading(lines, '## ')
  const intro = lines
    .slice(0, top[0]?.start ?? lines.length)
    .filter((line) => line.trim() !== '')
  const expectedIntro = [
    `# ${name}`,
    `- Screen: ${image.screen}`,
    `- Width: ${image.width}`,
    `- Theme: ${image.theme}`,
    `- Locale: ${image.locale}`,
  ]
  expectedIntro.forEach((line, index) => {
    if (intro[index]?.trim() !== line) {
      fail(
        index === 0
          ? `first line must be "${line}", found "${intro[index] ?? ''}"`
          : `header line ${index} must be "${line}", found "${intro[index] ?? ''}"`,
      )
    }
  })
  if (intro.length > expectedIntro.length) {
    fail(`unexpected text before "## Seen": "${intro[expectedIntro.length]}"`)
  }

  let lastIndex = -1
  for (const title of noteSections) {
    const index = top.findIndex((entry) => entry.title === title)
    if (index === -1) {
      fail(`missing section "## ${title}"`)
    } else if (index < lastIndex) {
      fail(`section "## ${title}" is out of order`)
    } else {
      lastIndex = index
    }
  }
  for (const entry of top) {
    if (!noteSections.includes(entry.title)) {
      fail(`unknown section "## ${entry.title}"`)
    }
  }
  const body = (title) =>
    top.find((entry) => entry.title === title)?.lines ?? null

  const seen = body('Seen')
  if (seen) {
    const bullets = seen.filter((line) => line.startsWith('- ')).length
    if (bullets < 3 || bullets > 8) {
      fail(`Seen has ${bullets} bullets, it needs 3 to 8`)
    }
  }

  const knownIdProblem = (id, context) => {
    if (findingIds && !findingIds.has(id)) {
      fail(`${context} ${id} is not in docs/UI_REVIEW.md Findings`)
    }
  }

  const problemLines = body('Problems')
  if (problemLines) {
    const content = problemLines.filter((line) => line.trim() !== '')
    if (content.length === 1 && content[0].trim() === 'None.') {
      // no problems
    } else if (content.length === 0) {
      fail('Problems is empty; write "None." or a table')
    } else if (content.some((line) => !line.trim().startsWith('|'))) {
      fail('Problems must be the line "None." or a table')
    } else {
      const rows = tableRows(problemLines)
      const header = rows[0]?.map(plain) ?? []
      if (header.join('|') !== problemColumns.join('|')) {
        fail(`Problems table columns must be: ${problemColumns.join(', ')}`)
      } else if (rows.length < 2) {
        fail('Problems table has no rows; write "None."')
      }
      if (header.join('|') === problemColumns.join('|')) {
        rows.slice(1).forEach((cells, index) => {
          const context = `problem ${index + 1}`
          if (cells.length !== problemColumns.length) {
            fail(
              `${context}: expected ${problemColumns.length} cells, found ${cells.length}`,
            )
            return
          }
          if (cells[0].trim() !== String(index + 1)) {
            fail(`${context}: # must be ${index + 1}, found "${cells[0]}"`)
          }
          const severity = plain(cells[1])
          if (!severities.includes(severity)) {
            fail(
              `${context}: invalid severity "${severity}" (use ${severities.join(', ')})`,
            )
          }
          const category = plain(cells[2])
          if (!categories.includes(category)) {
            fail(
              `${context}: invalid category "${category}" (use ${categories.join(', ')})`,
            )
          }
          if (cells[3].trim() === '') fail(`${context}: Issue is empty`)
          if (cells[4].trim() === '') fail(`${context}: Where is empty`)
          const known = cells[5].trim()
          if (/^U-\d\d+$/.test(known)) {
            knownIdProblem(known, `Known in ${context}:`)
          } else if (known === 'new') {
            if (!allowNew) {
              fail(
                `Known is "new" in ${context}; replace it with the U- ID it became or rejected: <reason>`,
              )
            }
          } else if (/^rejected:/.test(known)) {
            if (known.slice('rejected:'.length).trim() === '') {
              fail(`Known "rejected:" in ${context} has no reason`)
            }
          } else {
            fail(
              `${context}: Known "${known}" must be one U- ID, new or rejected: <reason>`,
            )
          }
        })
      }
    }
  }

  const rawLines = body('Raw checks')
  if (rawLines) {
    const content = rawLines
      .map((line) => line.trim())
      .filter((line) => line !== '')
    if (content.length === 0) {
      fail('Raw checks is empty; write "None."')
    } else if (!(content.length === 1 && content[0] === 'None.')) {
      content.forEach((line, index) => {
        const context = `Raw checks line ${index + 1}`
        const outcome = /→\s*(U-\d\d+|new|accepted(?::\s*\S.*)?)$/.exec(line)
        if (!line.startsWith('- ') || !outcome) {
          fail(
            `${context} must be a bullet ending in → U-NN, → new or → accepted: <reason>`,
          )
        } else if (outcome[1] === 'new') {
          if (!allowNew) {
            fail(
              `${context} ends in → new; replace it with the U- ID it became or accepted: <reason>`,
            )
          }
        } else if (outcome[1].startsWith('U-')) {
          knownIdProblem(outcome[1], `${context}:`)
        }
      })
    }
  }
  return problems
}

/**
 * @param {{ notesDir: string, markdown: string }} options the notes directory and the text of docs/UI_REVIEW.md
 * @returns {string[]} one message per problem
 */
export function checkNotes({ notesDir, markdown }) {
  const problems = []
  const lines = markdown.split('\n')
  const top = splitByHeading(lines, '## ')
  const section = (name) => top.find((entry) => entry.title === name)
  const rows = findingsRows(markdown)
  const findingIds = new Set(rows.map((row) => row.id))

  // 1. The notes are exactly the image names.
  const expected = imageNames()
  const present = existsSync(notesDir)
    ? readdirSync(notesDir).filter((file) => !file.startsWith('_'))
    : []
  const expectedFiles = new Set(expected.map((name) => `${name}.md`))
  for (const name of expected) {
    if (!present.includes(`${name}.md`)) {
      problems.push(`${notesPath}/${name}.md: missing`)
    }
  }
  for (const file of present) {
    if (!expectedFiles.has(file)) {
      problems.push(
        `${notesPath}/${file}: is not a screenshot of the screen list`,
      )
    }
  }

  // 2. Each note follows the format.
  const texts = new Map()
  for (const name of expected) {
    const file = join(notesDir, `${name}.md`)
    if (!existsSync(file) || statSync(file).isDirectory()) continue
    const text = readFileSync(file, 'utf8')
    texts.set(name, text)
    problems.push(...checkNote(name, text, { findingIds, allowNew: false }))
  }

  // 3. Cited notes exist and come with a screenshot.
  const citing = new Set()
  for (const row of rows) {
    const cited = citedNotes(row.evidence)
    for (const file of cited) {
      citing.add(row.id)
      if (!existsSync(join(notesDir, file))) {
        problems.push(
          `Finding ${row.id}: cited note ${notesPath}/${file} does not exist`,
        )
      }
    }
    if (cited.size > 0) {
      const jpgs = [...citedScreenshots(row.evidence)].filter((file) =>
        file.endsWith('.jpg'),
      )
      if (jpgs.length === 0) {
        problems.push(
          `Finding ${row.id}: cites a note but no screenshot (.jpg) of docs/ui-review/`,
        )
      }
    }
  }

  // 4. Review notes sits between Mobile and How to repeat.
  const review = section('Review notes')
  const reviewIndex = top.findIndex((entry) => entry.title === 'Review notes')
  if (!review) {
    problems.push('Missing section "## Review notes"')
  } else {
    const mobile = top.findIndex((entry) => entry.title === 'Mobile')
    const repeat = top.findIndex((entry) => entry.title === 'How to repeat')
    if (
      (mobile !== -1 && reviewIndex < mobile) ||
      (repeat !== -1 && reviewIndex > repeat)
    ) {
      problems.push(
        'Section "## Review notes" must be between Mobile and How to repeat',
      )
    }
  }

  if (review) {
    // 5. The summary lines match the notes.
    const counts = { problems: 0, existing: 0, added: 0, rejected: 0 }
    for (const text of texts.values()) {
      for (const known of problemKnowns(text)) {
        counts.problems += 1
        if (/^U-\d\d+$/.test(known)) {
          if (citing.has(known)) counts.added += 1
          else counts.existing += 1
        } else if (/^rejected:/.test(known)) {
          counts.rejected += 1
        }
      }
    }
    const reviewLine = (label) => {
      const prefix = `- ${label}:`
      const line = review.lines.find((entry) => entry.startsWith(prefix))
      return line === undefined ? null : line.slice(prefix.length).trim()
    }
    const stated = {}
    const numberLine = (label, key, value) => {
      const text = reviewLine(label)
      if (text === null || !/^\d+$/.test(text)) {
        problems.push(
          `Review notes line "- ${label}: N" is missing or malformed`,
        )
        return
      }
      stated[key] = Number(text)
      if (Number(text) !== value) {
        problems.push(
          `Review notes line "- ${label}" says ${text}, the notes give ${value}`,
        )
      }
    }
    numberLine('Notes', 'notes', texts.size)
    numberLine('Problems', 'problems', counts.problems)
    numberLine('Existing U-', 'existing', counts.existing)
    numberLine('New U-', 'added', counts.added)
    numberLine('Rejected', 'rejected', counts.rejected)
    if (
      ['problems', 'existing', 'added', 'rejected'].every(
        (key) => stated[key] !== undefined,
      ) &&
      stated.existing + stated.added + stated.rejected !== stated.problems
    ) {
      problems.push(
        `Review notes: Existing U- (${stated.existing}) + New U- (${stated.added}) + Rejected (${stated.rejected}) must equal Problems (${stated.problems})`,
      )
    }
    const run = reviewLine('Run')
    if (run === null || run === '') {
      problems.push('Review notes line "- Run: <text>" is missing or empty')
    }

    // 6. A row no note cites needs a line saying why.
    for (const row of rows) {
      if (citing.has(row.id)) continue
      const line = review.lines.find((entry) =>
        entry.startsWith(`- ${row.id}:`),
      )
      const rest = line?.slice(`- ${row.id}:`.length).trim() ?? ''
      if (/^not seen:\s*\S/.test(rest)) continue
      const confirmed = /^confirmed in\s+(.+)$/.exec(rest)
      if (confirmed) {
        const files = citedNotes(confirmed[1])
        if (files.size === 0) {
          problems.push(
            `Review notes: ${row.id} is confirmed in "${confirmed[1]}", which is no note path or link`,
          )
        }
        for (const file of files) {
          if (!existsSync(join(notesDir, file))) {
            problems.push(
              `Review notes: ${row.id} is confirmed in ${notesPath}/${file}, which does not exist`,
            )
          }
        }
        continue
      }
      problems.push(
        line === undefined
          ? `Finding ${row.id} has no line in Review notes and no note cites it`
          : `Review notes: the line for ${row.id} must be "confirmed in <note>" or "not seen: <reason>"`,
      )
    }
  }

  // 7. How to repeat names both scripts.
  const repeat = section('How to repeat')
  if (repeat) {
    const text = repeat.lines.join('\n')
    for (const script of ['queue.mjs', 'notes.mjs']) {
      if (!text.includes(script)) {
        problems.push(`"How to repeat" does not mention ${script}`)
      }
    }
  }
  return problems
}

/** R-41-03: the brief has the placeholder and a row for every screen. */
export function checkBrief(text) {
  const problems = []
  const where = `${notesPath}/_BRIEF.md`
  if (!text.includes('{{image}}')) {
    problems.push(`${where}: does not contain {{image}}`)
  }
  const first = new Set(
    tableRows(text.split('\n')).map((cells) => (cells[0] ?? '').trim()),
  )
  for (const screen of screens) {
    if (!first.has(`\`${screen.id}\``)) {
      problems.push(`${where}: has no table row for \`${screen.id}\``)
    }
  }
  return problems
}

const entry = process.argv[1]
if (entry && fileURLToPath(import.meta.url) === entry) {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
  const notesDir = join(root, notesPath)
  const markdown = readFileSync(join(root, 'docs', 'UI_REVIEW.md'), 'utf8')
  const flag = process.argv.indexOf('--note')
  let problems
  let done = `${notesPath}: ok`
  if (flag !== -1) {
    const name = process.argv[flag + 1] ?? ''
    const file = join(notesDir, `${name}.md`)
    done = `${notesPath}/${name}.md: ok`
    problems = existsSync(file)
      ? checkNote(name, readFileSync(file, 'utf8'), {
          findingIds: new Set(findingsRows(markdown).map((row) => row.id)),
          allowNew: true,
        })
      : [`${notesPath}/${name}.md: missing`]
  } else {
    const brief = join(notesDir, '_BRIEF.md')
    problems = [
      ...checkNotes({ notesDir, markdown }),
      ...(existsSync(brief)
        ? checkBrief(readFileSync(brief, 'utf8'))
        : [`${notesPath}/_BRIEF.md: missing`]),
    ]
  }
  for (const problem of problems) console.error(problem)
  if (problems.length > 0) process.exit(1)
  console.log(done)
}
