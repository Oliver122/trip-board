import { randomBytes } from 'node:crypto'
import { config as loadDotenv } from 'dotenv'
import pg from 'pg'
import { resolve } from 'node:path'
import { applyMigrations } from './migrate.js'
import { repoRoot } from './paths.js'

loadDotenv({ path: resolve(repoRoot, '.env') })

const { Pool } = pg

export type TestDatabase = {
  url: string
  pool: pg.Pool
  drop: () => Promise<void>
}

export async function createTestDatabase(
  options: { migrate?: boolean } = {},
): Promise<TestDatabase> {
  const adminUrl = process.env.DATABASE_URL
  if (!adminUrl) {
    throw new Error('DATABASE_URL is required for database tests')
  }

  const migrate = options.migrate !== false
  const name = `tb_${randomBytes(8).toString('hex')}`
  const admin = new Pool({ connectionString: adminUrl, max: 1 })
  const url = databaseUrlFor(adminUrl, name)
  const pool = new Pool({ connectionString: url, max: 4 })

  try {
    await admin.query(`CREATE DATABASE ${name}`)
    if (migrate) await applyMigrations(pool)
  } catch (error) {
    await pool.end()
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    await admin.end()
    throw error
  }

  return {
    url,
    pool,
    async drop() {
      await pool.end()
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
      await admin.end()
    },
  }
}

function databaseUrlFor(baseUrl: string, name: string): string {
  const url = new URL(baseUrl)
  url.pathname = `/${name}`
  return url.toString()
}
