import type { Pool, PoolClient } from 'pg'

export async function withTransaction<T>(
  pool: Pool,
  run: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const tx = await pool.connect()
  try {
    await tx.query('BEGIN')
    const result = await run(tx)
    await tx.query('COMMIT')
    return result
  } catch (error) {
    try {
      await tx.query('ROLLBACK')
    } catch {
      // The original error already aborted the transaction.
    }
    throw error
  } finally {
    tx.release()
  }
}
