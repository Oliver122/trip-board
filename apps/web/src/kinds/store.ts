import {
  kindLimits,
  type KindLimitRequest,
  type SpotKind,
} from '@tripboard/shared'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { latestKindRequest, listKinds } from './client'

/** One trip's kinds, shared by the toolbar, the spot panel and the kinds dialog. */
export type KindsState = {
  kinds: SpotKind[] | null
  /** The trip's effective kind limit and how many kinds it has. */
  limit: number
  count: number
  error: boolean
}

const empty: KindsState = {
  kinds: null,
  limit: kindLimits.defaultPerTrip,
  count: 0,
  error: false,
}
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
  const run = Promise.all([
    listKinds(tripId)
      .then((list) => set(tripId, { ...list, error: false }))
      .catch(() => {
        const previous = states.get(tripId) ?? empty
        set(tripId, { ...previous, error: true })
      }),
    // The dialog's request state follows every kind change (a live notice
    // after an admin decision), but only while a dialog watches it.
    requestWatchers.get(tripId) ? reloadKindRequest(tripId) : undefined,
  ])
    .then(() => undefined)
    .finally(() => loading.delete(tripId))
  loading.set(tripId, run)
  return run
}

/** Puts a list the server just returned into the store without a fetch. */
export function setKinds(
  tripId: string,
  kinds: SpotKind[],
  limit?: number,
): void {
  const previous = states.get(tripId) ?? empty
  set(tripId, {
    ...previous,
    kinds,
    limit: limit ?? previous.limit,
    count: kinds.length,
    error: false,
  })
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

/** The newest kind limit request of a trip; only board admins may read it. */
export type RequestState = {
  request: KindLimitRequest | null
  loaded: boolean
  error: boolean
}

const noRequest: RequestState = { request: null, loaded: false, error: false }
const requests = new Map<string, RequestState>()
const requestListeners = new Map<string, Set<() => void>>()
const requestWatchers = new Map<string, number>()

function setRequest(tripId: string, next: RequestState) {
  requests.set(tripId, next)
  for (const listener of requestListeners.get(tripId) ?? []) listener()
}

export async function reloadKindRequest(tripId: string): Promise<void> {
  try {
    const request = (await latestKindRequest(tripId)) ?? null
    setRequest(tripId, { request, loaded: true, error: false })
  } catch {
    const previous = requests.get(tripId) ?? noRequest
    setRequest(tripId, { ...previous, error: true })
  }
}

/** Puts a request the server just returned into the store. */
export function setKindRequest(
  tripId: string,
  request: KindLimitRequest | null,
): void {
  setRequest(tripId, { request, loaded: true, error: false })
}

export function useLatestKindRequest(tripId: string): RequestState {
  const subscribe = useCallback(
    (listener: () => void) => {
      const group = requestListeners.get(tripId) ?? new Set()
      group.add(listener)
      requestListeners.set(tripId, group)
      requestWatchers.set(tripId, (requestWatchers.get(tripId) ?? 0) + 1)
      return () => {
        group.delete(listener)
        requestWatchers.set(tripId, (requestWatchers.get(tripId) ?? 1) - 1)
      }
    },
    [tripId],
  )
  const state = useSyncExternalStore(
    subscribe,
    () => requests.get(tripId) ?? noRequest,
  )
  useEffect(() => {
    void reloadKindRequest(tripId)
  }, [tripId])
  return state
}
