import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { repoRoot } from './paths.js'
import { runPsqlFile } from './psql.js'

export const expectedCheckCount = 49

export async function runChecks(databaseUrl: string): Promise<void> {
  const source = readFileSync(
    join(repoRoot, 'docs', 'database', 'checks.sql'),
    'utf8',
  )
  const sql =
    process.platform === 'win32'
      ? source.replace('\\o /dev/null', '\\o NUL')
      : source
  const dir = mkdtempSync(join(tmpdir(), 'tripboard-checks-'))
  const filePath = join(dir, 'checks.sql')
  writeFileSync(filePath, sql)
  const result = await runPsqlFile(databaseUrl, filePath)
  const oks = result.stderr
    .split(/\r?\n/)
    .filter((line) => /NOTICE:\s+ok\s/.test(line))
  if (oks.length !== expectedCheckCount) {
    throw new Error(
      `Expected ${expectedCheckCount} schema checks, got ${oks.length}.\n${result.stderr}`,
    )
  }
}
