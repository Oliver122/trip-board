export const globalRateLimit = 300
export const globalRateWindowMs = 60_000

export class RequestLimiter {
  private readonly hits = new Map<string, number[]>()

  check(
    key: string,
    now: Date,
  ): { ok: true } | { ok: false; retryAfter: number } {
    const time = now.getTime()
    const recent = (this.hits.get(key) ?? []).filter(
      (at) => time - at < globalRateWindowMs,
    )
    if (recent.length >= globalRateLimit) {
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
}
