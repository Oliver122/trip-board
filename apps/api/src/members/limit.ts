export const joinRateLimit = 10
export const joinRateWindowMs = 60_000

export class JoinLimiter {
  private readonly hits = new Map<string, number[]>()

  allow(ip: string, now: Date): boolean {
    const time = now.getTime()
    const recent = (this.hits.get(ip) ?? []).filter(
      (at) => time - at < joinRateWindowMs,
    )
    if (recent.length >= joinRateLimit) {
      this.hits.set(ip, recent)
      return false
    }
    recent.push(time)
    this.hits.set(ip, recent)
    return true
  }

  clear(): void {
    this.hits.clear()
  }
}
