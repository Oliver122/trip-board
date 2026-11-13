// R-44-02: fail fast on stray errors, close gracefully on SIGTERM/SIGINT.
export interface GuardedProcess {
  on(event: string, handler: (arg?: never) => void): unknown
  exit(code: number): unknown
}

const CLOSE_TIMEOUT_MS = 10_000
const installed = new WeakSet<object>()

export function installProcessGuards(
  proc: GuardedProcess,
  log: (line: string) => void,
  close: () => Promise<void>,
) {
  if (installed.has(proc)) return
  installed.add(proc)

  const fatal = (event: string, error: unknown) => {
    const isError = error instanceof Error
    log(
      JSON.stringify({
        level: 'fatal',
        event,
        message: isError ? error.message : String(error),
        stack: isError ? (error.stack ?? null) : null,
        time: new Date().toISOString(),
      }),
    )
    proc.exit(1)
  }
  proc.on('unhandledRejection', (reason: unknown) =>
    fatal('unhandledRejection', reason),
  )
  proc.on('uncaughtException', (error: unknown) =>
    fatal('uncaughtException', error),
  )

  let closing = false
  const shutdown = (signal: string) => {
    if (closing) return
    closing = true
    log(
      JSON.stringify({
        level: 'info',
        event: 'shutdown',
        signal,
        time: new Date().toISOString(),
      }),
    )
    const timer = setTimeout(() => proc.exit(1), CLOSE_TIMEOUT_MS)
    timer.unref?.()
    close().then(
      () => {
        clearTimeout(timer)
        proc.exit(0)
      },
      () => {
        clearTimeout(timer)
        proc.exit(1)
      },
    )
  }
  proc.on('SIGTERM', () => shutdown('SIGTERM'))
  proc.on('SIGINT', () => shutdown('SIGINT'))
}
