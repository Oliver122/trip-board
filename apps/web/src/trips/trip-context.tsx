import type { PlanEntry, Spot, Trip } from '@tripboard/shared'
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Category } from '../components/category'
import type { LngLatBounds } from '../map/bounds'
import type { MapSpot } from '../map/clusters'

export type MapDraft = {
  lng: number
  lat: number
  category: Category
  filled?: boolean
}

/** Pins and camera hints the active page paints onto the shared map. */
export type MapScene = {
  spots: MapSpot[]
  selectedId: string | null
  hoverId: string | null
  placing: boolean
  draft: MapDraft | null
  highlightIds: string[]
  focus: { key: string; bounds: LngLatBounds } | null
  flyTo: { token: string; lng: number; lat: number } | null
}

export type MapHandlers = {
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  onPlace?: (lng: number, lat: number) => void
  onDraftMove?: (lng: number, lat: number) => void
  onViewport?: (bounds: LngLatBounds) => void
}

type TripState = {
  trip: Trip
  spots: Spot[]
  total: number
  entries: PlanEntry[] | null
  selectedEntryId: string | null
}

type TripContextValue = TripState & {
  setTrip: (trip: Trip) => void
  replaceSpots: (spots: Spot[], total: number) => void
  updateSpots: (fn: (spots: Spot[]) => Spot[]) => void
  setEntries: (entries: PlanEntry[]) => void
  setSelectedEntryId: (id: string | null) => void
  setScene: (scene: MapScene | null) => void
  scene: MapScene | null
  handlersRef: { current: MapHandlers }
}

const TripContext = createContext<TripContextValue | null>(null)

const idleHandlers: MapHandlers = {
  onSelect: () => undefined,
  onHover: () => undefined,
}

export function TripProvider({
  trip,
  spots,
  total,
  children,
}: {
  trip: Trip
  spots: Spot[]
  total: number
  children: ReactNode
}) {
  const [state, setState] = useState<TripState>({
    trip,
    spots,
    total,
    entries: null,
    selectedEntryId: null,
  })
  const [scene, setSceneState] = useState<MapScene | null>(null)
  const handlersRef = useRef<MapHandlers>(idleHandlers)

  const setTrip = useCallback((next: Trip) => {
    setState((current) => ({ ...current, trip: next }))
  }, [])
  const replaceSpots = useCallback((next: Spot[], nextTotal: number) => {
    setState((current) => ({ ...current, spots: next, total: nextTotal }))
  }, [])
  const updateSpots = useCallback((fn: (spots: Spot[]) => Spot[]) => {
    setState((current) => {
      const next = fn(current.spots)
      return { ...current, spots: next, total: next.length }
    })
  }, [])
  const setEntries = useCallback((entries: PlanEntry[]) => {
    setState((current) => ({ ...current, entries }))
  }, [])
  const setSelectedEntryId = useCallback((id: string | null) => {
    setState((current) => ({ ...current, selectedEntryId: id }))
  }, [])
  const setScene = useCallback((next: MapScene | null) => {
    setSceneState(next)
  }, [])

  const value = useMemo<TripContextValue>(
    () => ({
      ...state,
      setTrip,
      replaceSpots,
      updateSpots,
      setEntries,
      setSelectedEntryId,
      setScene,
      scene,
      handlersRef,
    }),
    [
      state,
      setTrip,
      replaceSpots,
      updateSpots,
      setEntries,
      setSelectedEntryId,
      setScene,
      scene,
    ],
  )

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}

export function useTripData() {
  const value = useContext(TripContext)
  if (!value) throw new Error('TripProvider is missing')
  return value
}

/**
 * The page publishes pins in layout, before paint, so a tab switch never
 * draws the previous page's draft on the next page.
 */
export function useMapScene(scene: MapScene, handlers: MapHandlers) {
  const { setScene, handlersRef } = useTripData()
  handlersRef.current = handlers
  useLayoutEffect(() => {
    setScene(scene)
  }, [scene, setScene])
  useLayoutEffect(() => {
    return () => setScene(null)
  }, [setScene])
}
