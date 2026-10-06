export const uploadRateLimit = 30
export const uploadRateWindowMs = 60_000

export class UploadLimiter {
  private readonly hits = new Map<string, number[]>()

  allow(userId: string, now: Date): boolean {
    const time = now.getTime()
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
}
