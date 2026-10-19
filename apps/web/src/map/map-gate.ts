import { useSyncExternalStore } from 'react'
import { useDataSaver } from '../lib/data-saver'

/**
 * Step 38 (R-38-09): with low data on, the map chunk, style and tiles load
 * only after *Load map*. Once requested (or once low data is off), the map
 * stays for the rest of the page's life.
 */
let requested = false
const listeners = new Set<() => void>()

export function requestMapLoad() {
  if (requested) return
  requested = true
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** `ready`: the map may load now. `load()` is what *Load map* calls. */
export function useMapGate(): { ready: boolean; load: () => void } {
  const { on } = useDataSaver()
  const wasRequested = useSyncExternalStore(
    subscribe,
    () => requested,
    () => false,
  )
  if (!on && !requested) requested = true
  return { ready: !on || wasRequested, load: requestMapLoad }
}

/** Test helper. */
export function resetMapGate() {
  requested = false
}
