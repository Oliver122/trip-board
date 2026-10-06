import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const interactive = /<(button|a|Link|NavLink)\b/g

export function missingHover(source: string): string[] {
  const missing: string[] = []
  for (const tag of openingTags(source)) {
    const name = /^<([A-Za-z]+)/.exec(tag)?.[1] ?? 'element'
    if (tag.includes('buttonVariants') || tag.includes('hoverClass')) continue
    missing.push(name)
  }
  return missing
}

export function missingHoverInTree(root: string): string[] {
  const problems: string[] = []
  for (const file of tsxFiles(root)) {
    const source = readFileSync(file, 'utf8')
    const missing = missingHover(source)
    if (missing.length > 0) {
      problems.push(`${file}: ${missing.join(', ')}`)
    }
  }
  return problems
}

function openingTags(source: string): string[] {
  const tags: string[] = []
  interactive.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = interactive.exec(source))) {
    const start = match.index
    let depth = 0
    let quote: string | null = null
    let end = source.length
    for (let index = start; index < source.length; index += 1) {
      const char = source[index]
      if (quote) {
        if (char === '\\') {
          index += 1
          continue
        }
        if (char === quote) quote = null
        continue
      }
      if (char === '"' || char === "'" || char === '`') {
        quote = char
        continue
      }
      if (char === '{') depth += 1
      else if (char === '}') depth = Math.max(0, depth - 1)
      else if (char === '>' && depth === 0) {
        end = index + 1
        break
      }
    }
    tags.push(source.slice(start, end))
    interactive.lastIndex = end
  }
  return tags
}

function tsxFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) found.push(...tsxFiles(path))
    else if (entry.endsWith('.tsx')) found.push(path)
  }
  return found
}
