export const placeLinkRateLimit = 20
export const placeLinkRateWindowMs = 60_000

export class PlaceLinkLimiter {
  private readonly hits = new Map<string, number[]>()

  /** Seconds to wait when the user is over the limit, or null when allowed. */
  check(userId: string, now: Date): number | null {
    const time = now.getTime()
    const recent = (this.hits.get(userId) ?? []).filter(
      (at) => time - at < placeLinkRateWindowMs,
    )
    if (recent.length >= placeLinkRateLimit) {
      this.hits.set(userId, recent)
      const oldest = recent[0] ?? time
      return Math.max(
        1,
        Math.ceil((oldest + placeLinkRateWindowMs - time) / 1000),
      )
    }
    recent.push(time)
    this.hits.set(userId, recent)
    return null
  }
}
