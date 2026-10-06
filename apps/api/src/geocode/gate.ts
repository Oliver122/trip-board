export class RequestGate {
  private tail: Promise<unknown> = Promise.resolve()
  private nextAllowed = 0

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = delayUntil,
  ) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const turn = this.tail.then(async () => {
      const wait = this.nextAllowed - this.now()
      if (wait > 0) await this.sleep(wait)
      this.nextAllowed = this.now() + this.intervalMs
      return task()
    })
    this.tail = turn.then(
      () => undefined,
      () => undefined,
    )
    return turn
  }
}

async function delayUntil(ms: number): Promise<void> {
  const target = Date.now() + ms
  while (Date.now() < target) {
    const remaining = target - Date.now()
    await new Promise((resolve) => setTimeout(resolve, remaining))
  }
}
