import { config as loadDotenv } from 'dotenv'
import { resolve } from 'node:path'
import { loadConfig } from '../config.js'
import { createPool } from '../db.js'
import { runChecks } from './checks.js'
import { applyMigrations } from './migrate.js'
import { createTestDatabase } from './test-db.js'
import { repoRoot } from './paths.js'
import { seedDatabase } from './seed.js'

loadDotenv({ path: resolve(repoRoot, '.env') })

const command = process.argv[2]
const config = loadConfig(process.env)
const pool = createPool(config.DATABASE_URL)

try {
  if (command === 'migrate') {
    await applyMigrations(pool)
    console.log('Migrations applied.')
  } else if (command === 'seed') {
    await applyMigrations(pool)
    await seedDatabase(pool)
    console.log('Seed applied.')
  } else if (command === 'check') {
    const scratch = await createTestDatabase()
    try {
      await runChecks(scratch.url)
      console.log('42 schema checks passed.')
    } finally {
      await scratch.drop()
    }
  } else {
    console.error('Usage: tsx src/db/cli.ts <migrate|seed|check>')
    process.exitCode = 1
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
} finally {
  await pool.end()
}
