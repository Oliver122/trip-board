import pg from 'pg'

const { Pool } = pg

export function createPool(
  databaseUrl: string,
  log: (line: string) => void = (line) => console.error(line),
) {
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    max: 10,
  })
  // R-44-06: idle-client errors become one structured log line
  pool.on('error', (error) => {
    try {
      log(
        JSON.stringify({
          level: 'error',
          source: 'pg-pool',
          message: error.message,
          time: new Date().toISOString(),
        }),
      )
    } catch {
      // logging must never throw out of the pool's error event
    }
  })
  return pool
}

export async function pingDatabase(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}
