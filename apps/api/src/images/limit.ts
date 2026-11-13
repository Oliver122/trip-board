export const uploadRateLimit = 30
export const uploadRateWindowMs = 60_000

export class UploadLimiter {
  private readonly hits = new Map<string, number[]>()
  private lastSweep = 0

  allow(userId: string, now: Date): boolean {
    const time = now.getTime()
    // R-44-03: drop keys idle for a whole window
    if (time - this.lastSweep > uploadRateWindowMs) {
      this.lastSweep = time
      for (const [key, hits] of this.hits) {
        const newest = hits[hits.length - 1]
        if (newest === undefined || time - newest >= uploadRateWindowMs)
          this.hits.delete(key)
      }
    }
    const recent = (this.hits.get(userId) ?? []).filter(
      (at) => time - at < uploadRateWindowMs,
    )
    if (recent.length >= uploadRateLimit) {
      this.hits.set(userId, recent)
      return false
    }
    recent.push(time)
    this.hits.set(userId, recent)
    return true
  }

  /** Gives back the user's newest hit, e.g. for a file that failed to decode (R-44-07). */
  refund(userId: string): void {
    const hits = this.hits.get(userId)
    if (!hits) return
    hits.pop()
    if (hits.length === 0) this.hits.delete(userId)
  }

  /** Number of tracked keys; for tests (R-44-03). */
  size(): number {
    return this.hits.size
  }
}
