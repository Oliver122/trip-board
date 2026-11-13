import { describe, expect, it } from 'vitest'
import { createPool } from './db.js'

describe('createPool', () => {
  it('T-44-06 uses max 10 and logs idle-client errors as one JSON line', async () => {
    const lines: string[] = []
    const pool = createPool('postgres://u:p@127.0.0.1:1/none', (line) =>
      lines.push(line),
    )
    try {
      expect(pool.options.max).toBe(10)
      expect(() => pool.emit('error', new Error('boom'))).not.toThrow()
      expect(lines).toHaveLength(1)
      const entry = JSON.parse(lines[0]!)
      expect(entry.level).toBe('error')
      expect(entry.source).toBe('pg-pool')
      expect(entry.message).toBe('boom')
      expect(typeof entry.time).toBe('string')
    } finally {
      await pool.end()
    }
  })
})
