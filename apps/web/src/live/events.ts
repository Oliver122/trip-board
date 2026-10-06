export type LiveChange = {
  resource: string
  id: string | null
  action: string
  actorId: string | null
  clientId: string | null
}

export type FoldedChanges = {
  resources: string[]
  changes: LiveChange[]
}

export function foldChanges(
  events: LiveChange[],
  ownClientId: string,
): FoldedChanges {
  const changes = events.filter((event) => event.clientId !== ownClientId)
  const resources: string[] = []
  for (const event of changes) {
    if (!resources.includes(event.resource)) resources.push(event.resource)
  }
  return { resources, changes }
}

export function createEventBatcher(options: {
  clientId: string
  wait?: number
  onFlush: (folded: FoldedChanges) => void
  schedule?: (run: () => void, wait: number) => () => void
}) {
  const wait = options.wait ?? 300
  const schedule =
    options.schedule ??
    ((run: () => void, delay: number) => {
      const timer = setTimeout(run, delay)
      return () => clearTimeout(timer)
    })
  let pending: LiveChange[] = []
  let cancelTimer: (() => void) | null = null

  return {
    push(event: LiveChange) {
      pending.push(event)
      if (cancelTimer) cancelTimer()
      cancelTimer = schedule(() => {
        const batch = pending
        pending = []
        cancelTimer = null
        const folded = foldChanges(batch, options.clientId)
        if (folded.changes.length > 0) options.onFlush(folded)
      }, wait)
    },
    cancel() {
      if (cancelTimer) cancelTimer()
      cancelTimer = null
      pending = []
    },
  }
}
