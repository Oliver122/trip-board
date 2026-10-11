import type { SpotKind } from '@tripboard/shared'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { listKinds } from './client'

/** One trip's kinds, shared by the toolbar, the spot panel and the kinds dialog. */
export type KindsState = {
  kinds: SpotKind[] | null
  error: boolean
}

const empty: KindsState = { kinds: null, error: false }
const states = new Map<string, KindsState>()
const listeners = new Map<string, Set<() => void>>()
const loading = new Map<string, Promise<void>>()

function set(tripId: string, next: KindsState) {
  states.set(tripId, next)
  for (const listener of listeners.get(tripId) ?? []) listener()
}

/** Fetches the kinds again. Callers: the hook on mount, live `kind` events, dialog writes. */
export function reloadKinds(tripId: string): Promise<void> {
  const pending = loading.get(tripId)
  if (pending) return pending
  const run = listKinds(tripId)
    .then((kinds) => set(tripId, { kinds, error: false }))
    .catch(() =>
      set(tripId, { kinds: states.get(tripId)?.kinds ?? null, error: true }),
    )
    .finally(() => loading.delete(tripId))
  loading.set(tripId, run)
  return run
}

/** Puts a list the server just returned into the store without a fetch. */
export function setKinds(tripId: string, kinds: SpotKind[]): void {
  set(tripId, { kinds, error: false })
}

export function useTripKinds(tripId: string | undefined): KindsState & {
  reload: () => Promise<void>
} {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!tripId) return () => undefined
      const group = listeners.get(tripId) ?? new Set()
      group.add(listener)
      listeners.set(tripId, group)
      return () => group.delete(listener)
    },
    [tripId],
  )
  const state = useSyncExternalStore(subscribe, () =>
    tripId ? (states.get(tripId) ?? empty) : empty,
  )
  useEffect(() => {
    if (tripId && !states.get(tripId)?.kinds) void reloadKinds(tripId)
  }, [tripId])
  const reload = useCallback(
    () => (tripId ? reloadKinds(tripId) : Promise.resolve()),
    [tripId],
  )
  return { ...state, reload }
}
