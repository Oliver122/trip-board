import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const fetchAllowList = [
  'session.tsx',
  'use-locale.ts',
  'pages/LoginPage.tsx',
  'dev-login.tsx',
]

// `file` is a path relative to apps/web/src, using forward slashes.
export function structureViolations(source: string, file: string): string[] {
  const found: string[] = []
  if (/\bwindow\.confirm\b/.test(source)) found.push('window.confirm')
  if (/\bfixed inset-0\b/.test(source) && file !== 'components/ui/modal.tsx') {
    found.push('fixed inset-0')
  }
  if (/<select\b/.test(source) && file !== 'components/ui/select.tsx') {
    found.push('<select')
  }
  if (
    /\bfetch\(/.test(source) &&
    !file.startsWith('api/') &&
    !fetchAllowList.includes(file)
  ) {
    found.push('fetch(')
  }
  return found
}

export function structureViolationsInTree(root: string): string[] {
  const problems: string[] = []
  for (const path of sourceFiles(root)) {
    const file = relative(root, path).split(sep).join('/')
    if (file === 'structure-lint.ts') continue
    const violations = structureViolations(readFileSync(path, 'utf8'), file)
    if (violations.length > 0)
      problems.push(`${file}: ${violations.join(', ')}`)
  }
  return problems
}

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(path)
    }
  }
  return found
}

const seededLogin =
  /\blogin\(\s*\w+\s*,\s*(?:sven|aiko|tom|['"`]1000000000000000\d+['"`])\s*\)/

// Heuristic: split on `test(` and flag a block that logs in as a seeded user
// and also calls `setLocale(`, which writes that user's stored language.
// Also flags anything that hides flakiness behind time.
export function e2eStabilityViolations(source: string): string[] {
  const found: string[] = []
  const blocks = source.split(/\btest(?:\.\w+)?\(/)
  if (blocks.some((b) => seededLogin.test(b) && /\bsetLocale\(/.test(b))) {
    found.push('setLocale on seeded user')
  }
  if (/\bwaitForTimeout\b/.test(source)) found.push('waitForTimeout')
  if (/\btest\.slow\(/.test(source)) found.push('test.slow')
  if (/\bretries\b/.test(source)) found.push('retries')
  for (const match of source.matchAll(/\btest\.setTimeout\(\s*([\d_]+)/g)) {
    if (Number(match[1]!.replaceAll('_', '')) > 30000) {
      found.push('test.setTimeout > 30s')
      break
    }
  }
  return found
}

export function e2eCleanupViolations(): string[] {
  const path = fileURLToPath(
    new URL('../../../e2e/cleanup.spec.ts', import.meta.url),
  )
  return e2eStabilityViolations(readFileSync(path, 'utf8'))
}

const sharedUser =
  /\b(?:login|signIn|newSession)\(\s*\w+\s*,\s*(?:sven|aiko|tom|svenId|aikoId|tomId|['"`]10{15}0[123]['"`])\s*\)/
const nonEnglishLocaleWrite = /\bsetLocale\(\s*\w+\s*,\s*(?!\s|'en'\s*\))/

// Suite-wide heuristic: split on `test(` and `function ` and flag a block that
// signs in a shared seeded user (sven, aiko, tom) and stores any language but
// English on it; a seeded login in a `beforeEach`/`beforeAll` covers the file. Parallel specs read those accounts; a German page must use
// `showLocale` from e2e/locale.ts instead. dev-login.spec.ts runs alone as a
// teardown, and cleanup.spec.ts has the stricter rule above.
export function e2eLocaleViolations(source: string): string[] {
  const blocks = source.split(/\btest(?:\.\w+)?\(|\bfunction\s/)
  // A seeded login in a hook applies to every test in the file.
  const hookLogin = [
    ...source.matchAll(/\btest\.before(?:Each|All)\(([\s\S]*?)\n\}\)/g),
  ].some((match) => sharedUser.test(match[1]!))
  const seededWrite = hookLogin
    ? nonEnglishLocaleWrite.test(source)
    : blocks.some((b) => sharedUser.test(b) && nonEnglishLocaleWrite.test(b))
  return seededWrite ? ['non-English setLocale on seeded user'] : []
}

export function e2eSuiteLocaleViolations(): string[] {
  const dir = fileURLToPath(new URL('../../../e2e/', import.meta.url))
  return readdirSync(dir)
    .filter(
      (file) =>
        file.endsWith('.spec.ts') &&
        file !== 'dev-login.spec.ts' &&
        file !== 'cleanup.spec.ts',
    )
    .flatMap((file) =>
      e2eLocaleViolations(readFileSync(join(dir, file), 'utf8')).map(
        (rule) => `${file}: ${rule}`,
      ),
    )
}
