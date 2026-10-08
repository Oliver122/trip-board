export const commentRateLimit = 20
export const commentRateWindowMs = 60_000

/** At most 20 new comments per user per minute (R-24-11). */
export class CommentLimiter {
  private readonly hits = new Map<string, number[]>()

  check(
    userId: string,
    now: Date,
  ): { ok: true } | { ok: false; retryAfter: number } {
    const time = now.getTime()
    const recent = (this.hits.get(userId) ?? []).filter(
      (at) => time - at < commentRateWindowMs,
    )
    if (recent.length >= commentRateLimit) {
      this.hits.set(userId, recent)
      const oldest = recent[0] ?? time
      const retryAfter = Math.max(
        1,
        Math.ceil((oldest + commentRateWindowMs - time) / 1000),
      )
      return { ok: false, retryAfter }
    }
    recent.push(time)
    this.hits.set(userId, recent)
    return { ok: true }
  }
}
