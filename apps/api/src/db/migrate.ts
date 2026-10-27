import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Pool, PoolClient } from 'pg'
import { migrationsDir } from './paths.js'

const MIGRATION_FILES = [
  '0000_tables.sql',
  '0001_rules.sql',
  '0002_webhook.sql',
  '0003_spot_comments.sql',
  '0004_spot_kinds.sql',
  '0005_kind_catalog.sql',
  '0006_web_photos.sql',
  '0007_file_size_limit.sql',
] as const

export async function applyMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle')
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id serial PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `)

    const present = new Set(readdirSync(migrationsDir))
    for (const file of MIGRATION_FILES) {
      if (!present.has(file)) {
        throw new Error(`Missing migration file ${file}`)
      }
    }

    const applied = await client.query<{ hash: string }>(
      'SELECT hash FROM drizzle.__drizzle_migrations',
    )
    const appliedHashes = new Set(applied.rows.map((row) => row.hash))

    for (const file of MIGRATION_FILES) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      const hash = createHash('sha256').update(sql).digest('hex')
      if (appliedHashes.has(hash)) continue
      await applyFile(client, sql, hash)
    }
  } finally {
    client.release()
  }
}

async function applyFile(client: PoolClient, sql: string, hash: string) {
  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query(
      'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
      [hash, Date.now()],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
