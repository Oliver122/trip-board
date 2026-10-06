import {
  defaultSpotListQuery,
  type PlanEntry,
  type Trip,
} from '@tripboard/shared'
import { useEffect, useRef } from 'react'
import { clientId } from '../api/write'
import { listPlan } from '../plan/client'
import { listSpots } from '../spots/client'
import { getTrip, NotFoundError } from '../trips/client'
import { emitMembersRefresh } from './bus'
import {
  createEventBatcher,
  type FoldedChanges,
  type LiveChange,
} from './events'

const debounceMs = 300
const pollMs = 15_000
const hiddenLimitMs = 5 * 60 * 1000
const failureLimit = 3

type Refresh = {
  replaceSpots: (spots: TripSpots, total: number) => void
  setEntries: (entries: PlanEntry[]) => void
  setTrip: (trip: Trip) => void
  bumpImages: () => void
  onNotices: (changes: LiveChange[]) => void
  onLostAccess: () => void
  onPollError: () => void
}

type TripSpots = Awaited<ReturnType<typeof listSpots>>['spots']

export function useTripEvents(tripId: string, refresh: Refresh) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    let closed = false
    let source: EventSource | null = null
    let failures = 0
    let pollTimer = 0
    let hiddenAt: number | null = null
    let polling = false

    const batcher = createEventBatcher({
      clientId: clientId(),
      wait: debounceMs,
      onFlush: (folded) => {
        void apply(folded)
      },
    })

    async function loadAll() {
      const [trip, spots, entries] = await Promise.all([
        getTrip(tripId),
        listSpots(tripId, defaultSpotListQuery),
        listPlan(tripId),
      ])
      if (closed) return
      refreshRef.current.setTrip(trip)
      refreshRef.current.replaceSpots(spots.spots, spots.total)
      refreshRef.current.setEntries(entries)
    }

    async function apply(folded: FoldedChanges) {
      const resources = new Set(folded.resources)
      try {
        if (
          resources.has('spot') ||
          resources.has('home') ||
          resources.has('plan')
        ) {
          const spots = await listSpots(tripId, defaultSpotListQuery)
          if (!closed) refreshRef.current.replaceSpots(spots.spots, spots.total)
        }
        if (resources.has('plan')) {
          const entries = await listPlan(tripId)
          if (!closed) refreshRef.current.setEntries(entries)
        }
        if (resources.has('member') || resources.has('trip')) {
          const trip = await getTrip(tripId)
          if (closed) return
          refreshRef.current.setTrip(trip)
          if (resources.has('member')) emitMembersRefresh(trip.members)
        }
        if (resources.has('image')) refreshRef.current.bumpImages()
        if (
          resources.has('trip') &&
          folded.changes.some((event) => event.action === 'trip.delete')
        ) {
          refreshRef.current.onLostAccess()
        }
        refreshRef.current.onNotices(folded.changes)
      } catch (error) {
        if (error instanceof NotFoundError) refreshRef.current.onLostAccess()
        else if (polling) refreshRef.current.onPollError()
      }
    }

    function stopPoll() {
      polling = false
      if (pollTimer) window.clearInterval(pollTimer)
      pollTimer = 0
    }

    function startPoll() {
      if (polling || closed) return
      polling = true
      source?.close()
      source = null
      const tick = () => {
        void loadAll().catch((error: unknown) => {
          if (error instanceof NotFoundError) refreshRef.current.onLostAccess()
          else refreshRef.current.onPollError()
        })
      }
      tick()
      pollTimer = window.setInterval(tick, pollMs)
    }

    function open() {
      if (closed || polling) return
      source?.close()
      const next = new EventSource(`/api/trips/${tripId}/events`)
      source = next
      next.onopen = () => {
        failures = 0
      }
      next.addEventListener('change', (event) => {
        const data = JSON.parse((event as MessageEvent).data) as LiveChange
        batcher.push(data)
      })
      next.addEventListener('resync', () => {
        void loadAll().catch((error: unknown) => {
          if (error instanceof NotFoundError) refreshRef.current.onLostAccess()
        })
      })
      next.onerror = () => {
        if (next !== source) return
        failures += 1
        if (failures >= failureLimit) startPoll()
      }
    }

    function onVisibility() {
      if (document.hidden) {
        hiddenAt = Date.now()
        return
      }
      const away = hiddenAt != null && Date.now() - hiddenAt > hiddenLimitMs
      hiddenAt = null
      if (!away) return
      source?.close()
      source = null
      stopPoll()
      failures = 0
      void loadAll()
        .catch((error: unknown) => {
          if (error instanceof NotFoundError) refreshRef.current.onLostAccess()
        })
        .finally(() => {
          if (!closed) open()
        })
    }

    document.addEventListener('visibilitychange', onVisibility)
    open()

    return () => {
      closed = true
      document.removeEventListener('visibilitychange', onVisibility)
      batcher.cancel()
      stopPoll()
      source?.close()
      source = null
    }
  }, [tripId])
}
