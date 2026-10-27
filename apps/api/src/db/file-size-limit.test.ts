import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runChecks } from './checks.js'
import { createTestDatabase, type TestDatabase } from './test-db.js'

const hasDb = Boolean(process.env.DATABASE_URL)

const plain = '00000000-0000-0000-0000-0000000000d1'
const limited = '00000000-0000-0000-0000-0000000000d2'

describe.skipIf(!hasDb)('T-43-01 migration 0007 file size limit', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase()
    await db.pool.query(
      `INSERT INTO users (id, discord_id, username) VALUES
         ($1, '100000000000004301', 'd1'), ($2, '100000000000004302', 'd2')`,
      [plain, limited],
    )
  }, 60_000)

  afterAll(async () => {
    await db?.pool.end()
    await db?.drop()
  })

  it('defaults the platform limit to 10 MiB', async () => {
    const result = await db.pool.query(
      'SELECT default_max_file_bytes FROM app_settings',
    )
    expect(Number(result.rows[0].default_max_file_bytes)).toBe(10485760)
  })

  it('refuses values below 1 MiB and above 50 MiB', async () => {
    for (const value of [1048575, 52428801]) {
      await expect(
        db.pool.query('UPDATE users SET max_file_bytes = $1 WHERE id = $2', [
          value,
          plain,
        ]),
      ).rejects.toThrow(/users_max_file_bytes_check/)
      await expect(
        db.pool.query('UPDATE app_settings SET default_max_file_bytes = $1', [
          value,
        ]),
      ).rejects.toThrow(/app_settings_default_max_file_bytes_check/)
    }
    for (const value of [1048576, 52428800]) {
      await db.pool.query(
        'UPDATE users SET max_file_bytes = $1 WHERE id = $2',
        [value, plain],
      )
    }
    await db.pool.query(
      'UPDATE users SET max_file_bytes = NULL WHERE id = $1',
      [plain],
    )
  })

  it('shows the effective value and the override flag in user_quota_usage', async () => {
    await db.pool.query('UPDATE users SET max_file_bytes = $1 WHERE id = $2', [
      20971520,
      limited,
    ])
    const rows = await db.pool.query(
      `SELECT user_id, max_file_bytes, has_override FROM user_quota_usage`,
    )
    const byUser = new Map(rows.rows.map((row) => [row.user_id, row]))
    expect(Number(byUser.get(limited).max_file_bytes)).toBe(20971520)
    expect(byUser.get(limited).has_override).toBe(true)
    expect(Number(byUser.get(plain).max_file_bytes)).toBe(10485760)
    expect(byUser.get(plain).has_override).toBe(false)

    await db.pool.query(
      'UPDATE app_settings SET default_max_file_bytes = $1',
      [5242880],
    )
    const after = await db.pool.query(
      `SELECT user_id, max_file_bytes FROM user_quota_usage`,
    )
    const changed = new Map(after.rows.map((row) => [row.user_id, row]))
    expect(Number(changed.get(plain).max_file_bytes)).toBe(5242880)
    expect(Number(changed.get(limited).max_file_bytes)).toBe(20971520)
  })

  it('keeps the admin_user_overview columns', async () => {
    const result = await db.pool.query('SELECT * FROM admin_user_overview')
    expect(Object.keys(result.rows[0])).not.toContain('max_file_bytes')
    expect(result.rows[0]).toHaveProperty('has_override')
  })

  it('passes docs/database/checks.sql', async () => {
    const fresh = await createTestDatabase()
    try {
      await expect(runChecks(fresh.url)).resolves.toBeUndefined()
    } finally {
      await fresh.pool.end()
      await fresh.drop()
    }
  })
})
