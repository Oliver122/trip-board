import type { Pool } from 'pg'

const flushIntervalMs = 60_000

type Counts = { http5xx: number; http429: number }

/** UTC day (YYYY-MM-DD) of a date. */
function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function logError(msg: string, error: unknown): void {
  console.error(
    JSON.stringify({
      level: 'error',
      msg,
      err: error instanceof Error ? error.message : String(error),
    }),
  )
}

/**
 * In-memory 5xx / 429 counts per UTC day, flushed to `ops_counters` (R-45-06).
 * Nothing here ever throws: a failed write is logged and the counts stay for
 * the next flush. There is at most one entry per day, so memory stays bounded.
 */
export class OpsCounters {
  private readonly pending = new Map<string, Counts>()
  private timer: NodeJS.Timeout | undefined

  constructor(private readonly pool: Pool) {}

  /** Adds one to today's `api_starts`. */
  async recordStart(now: Date): Promise<void> {
    try {
      await this.pool.query(
        `
        INSERT INTO ops_counters (day, api_starts) VALUES ($1, 1)
        ON CONFLICT (day) DO UPDATE SET api_starts = ops_counters.api_starts + 1
        `,
        [utcDay(now)],
      )
    } catch (error) {
      logError('ops_counters start failed', error)
    }
  }

  recordResponse(statusCode: number, now: Date): void {
    if (statusCode !== 429 && statusCode < 500) return
    const day = utcDay(now)
    const counts = this.pending.get(day) ?? { http5xx: 0, http429: 0 }
    if (statusCode === 429) counts.http429 += 1
    else counts.http5xx += 1
    this.pending.set(day, counts)
  }

  /** Writes the pending counts; on failure they stay for the next attempt. */
  async flush(): Promise<void> {
    for (const [day, counts] of [...this.pending]) {
      this.pending.delete(day)
      try {
        await this.pool.query(
          `
          INSERT INTO ops_counters (day, http_5xx, http_429) VALUES ($1, $2, $3)
          ON CONFLICT (day) DO UPDATE SET
            http_5xx = ops_counters.http_5xx + EXCLUDED.http_5xx,
            http_429 = ops_counters.http_429 + EXCLUDED.http_429
          `,
          [day, counts.http5xx, counts.http429],
        )
      } catch (error) {
        logError('ops_counters flush failed', error)
        // Merge back what was taken, plus anything counted meanwhile.
        const now = this.pending.get(day)
        this.pending.set(day, {
          http5xx: counts.http5xx + (now?.http5xx ?? 0),
          http429: counts.http429 + (now?.http429 ?? 0),
        })
      }
    }
  }

  startTimer(): void {
    this.timer = setInterval(() => void this.flush(), flushIntervalMs)
    this.timer.unref()
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    await this.flush()
  }
}
