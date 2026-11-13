export const joinRateLimit = 10
export const joinRateWindowMs = 60_000

export class JoinLimiter {
  constructor(private readonly limit = joinRateLimit) {}

  private readonly hits = new Map<string, number[]>()
  private lastSweep = 0

  allow(ip: string, now: Date): boolean {
    const time = now.getTime()
    // R-44-03: drop keys idle for a whole window
    if (time - this.lastSweep > joinRateWindowMs) {
      this.lastSweep = time
      for (const [key, hits] of this.hits) {
        const newest = hits[hits.length - 1]
        if (newest === undefined || time - newest >= joinRateWindowMs)
          this.hits.delete(key)
      }
    }
    const recent = (this.hits.get(ip) ?? []).filter(
      (at) => time - at < joinRateWindowMs,
    )
    if (recent.length >= this.limit) {
      this.hits.set(ip, recent)
      return false
    }
    recent.push(time)
    this.hits.set(ip, recent)
    return true
  }

  /** Number of tracked keys; for tests (R-44-03). */
  size(): number {
    return this.hits.size
  }

  clear(): void {
    this.hits.clear()
  }
}
