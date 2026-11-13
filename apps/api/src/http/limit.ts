export const globalRateLimit = 300
export const globalRateWindowMs = 60_000

export class RequestLimiter {
  private readonly hits = new Map<string, number[]>()
  private lastSweep = 0

  constructor(private readonly limit = globalRateLimit) {}

  check(
    key: string,
    now: Date,
  ): { ok: true } | { ok: false; retryAfter: number } {
    const time = now.getTime()
    // R-44-03: drop keys idle for a whole window so the map cannot grow forever
    if (time - this.lastSweep > globalRateWindowMs) {
      this.lastSweep = time
      for (const [key, hits] of this.hits) {
        const newest = hits[hits.length - 1]
        if (newest === undefined || time - newest >= globalRateWindowMs)
          this.hits.delete(key)
      }
    }
    const recent = (this.hits.get(key) ?? []).filter(
      (at) => time - at < globalRateWindowMs,
    )
    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      const oldest = recent[0] ?? time
      const retryAfter = Math.max(
        1,
        Math.ceil((oldest + globalRateWindowMs - time) / 1000),
      )
      return { ok: false, retryAfter }
    }
    recent.push(time)
    this.hits.set(key, recent)
    return { ok: true }
  }

  /** Number of tracked keys; for tests (R-44-03). */
  size(): number {
    return this.hits.size
  }
}
