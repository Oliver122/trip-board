import { join } from 'node:path'
import { getTableName, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectedCheckCount, runChecks } from './checks.js'
import { repoRoot } from './paths.js'
import { dumpSchema, normalizeSchemaDump, runPsqlFile } from './psql.js'
import * as schema from './schema.js'
import { createTestDatabase, type TestDatabase } from './test-db.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('migrated schema', () => {
  let migrated: TestDatabase
  let reference: TestDatabase

  beforeAll(async () => {
    migrated = await createTestDatabase()
    reference = await createTestDatabase({ migrate: false })
    await runPsqlFile(
      reference.url,
      join(repoRoot, 'docs', 'database', 'schema.sql'),
    )
  }, 60_000)

  afterAll(async () => {
    await migrated?.pool.end()
    await migrated?.drop()
    await reference?.pool.end()
    await reference?.drop()
  })

  // T-01-02
  it('matches docs/database/schema.sql', async () => {
    const migratedDump = normalizeSchemaDump(await dumpSchema(migrated.url))
    const referenceDump = normalizeSchemaDump(await dumpSchema(reference.url))
    expect(firstDiff(migratedDump, referenceDump)).toBeNull()
    expect(migratedDump).toBe(referenceDump)
  })

  // T-01-01; checks.sql also holds the T-24-01 (spot_comments constraints) and T-24-18 (spot_comment_reads cascade and trip match) checks
  it('passes checks.sql', async () => {
    await expect(runChecks(migrated.url)).resolves.toBeUndefined()
    expect(expectedCheckCount).toBe(74)
  })

  it('defines every table from the reference schema', async () => {
    const defined = Object.values(schema)
      .filter((value) => is(value, PgTable))
      .map((table) => getTableName(table))
      .sort()
    const result = await migrated.pool.query<{ table_name: string }>(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
      `,
    )
    expect(defined).toEqual(result.rows.map((row) => row.table_name))
  })
})

function firstDiff(left: string, right: string): string | null {
  const a = left.split('\n')
  const b = right.split('\n')
  const max = Math.max(a.length, b.length)
  for (let index = 0; index < max; index += 1) {
    if (a[index] !== b[index]) {
      return `line ${index + 1}\nmigrated: ${a[index] ?? '<missing>'}\nreference: ${b[index] ?? '<missing>'}`
    }
  }
  return null
}
