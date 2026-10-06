import pg from 'pg'

const { Pool } = pg

export function createPool(databaseUrl: string) {
  return new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    max: 2,
  })
}

export async function pingDatabase(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}
