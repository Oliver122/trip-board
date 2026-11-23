import {
  defaultSpotListQuery,
  type PlanEntry,
  type Spot,
  type Trip,
} from '@tripboard/shared'
import type { LiveChange } from '../live/events'
import { useTripEvents } from '../live/use-trip-events'
import { useTripKinds } from '../kinds/store'
import { listSpots } from '../spots/client'
import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Category, KindMark } from '../components/category'
import type { LngLatBounds } from '../map/bounds'
import type { MapSpot } from '../map/clusters'

type MapDraft = {
  lng: number
  lat: number
  category: Category
  kinds?: KindMark[]
  filled?: boolean
}

/** One numbered stop of a day on the schedule map (R-46-05). */
export type PlanMapStop = {
  linkId: string
  entryId: string
  spotId: string
  title: string
  stopNumber: number
  lng: number
  lat: number
}

/** One day of the plan as the map draws it (R-46-05, R-46-06). */
export type PlanMapDay = {
  /** `YYYY-MM-DD`, also the day's key. */
  date: string
  /** Localised short day, e.g. "Mon 13 Apr" / "Mo., 13. Apr.". */
  label: string
  /** 0..7, picks `dayColor` / `--day-N`. */
  colorIndex: number
  /** Stops with coordinates, in day order. */
  stops: PlanMapStop[]
}

/** The plan layer of the schedule map; absent on every other page (R-46-05). */
export type PlanMapScene = {
  days: PlanMapDay[]
  /** Spots without any dated visit: drawn as normal pins at 40 % opacity. */
  undatedSpotIds: string[]
  /** The focused day (R-46-07), or null. */
  focusedDate: string | null
  /** The visit selected in the list, its numbered pin is raised. */
  selectedLinkId: string | null
  /** R-46-09: the plan has entries but no visit has a date. */
  showHint: boolean
}

/** One placed photo on the photobook map (R-47-07). */
export type PhotoMapMarker = {
  id: string
  lng: number
  lat: number
  /** Signed thumbnail source (`imageSrc(url)`), or null to show the image icon (low data, R-47-10). */
  src: string | null
  /** Accessible name, "Photo <time>, <place>" (`photobook.markerLabel`). */
  label: string
}

/** The photo layer of the photobook map; absent on every other page (R-47-07). */
export type PhotoMapScene = {
  markers: PhotoMapMarker[]
  /** The photo highlighted in the book; its marker is raised and ringed. */
  highlightId: string | null
  /** Planners may drag markers to move a photo (R-47-09). */
  draggable: boolean
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
  /** Only the Schedule tab sets this (R-46-05). */
  plan?: PlanMapScene | null
  /** Only the Photobook tab sets this (R-47-07). */
  photos?: PhotoMapScene | null
}

type MapHandlers = {
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  onPlace?: (lng: number, lat: number) => void
  onContextPlace?: (lng: number, lat: number) => boolean
  onDraftMove?: (lng: number, lat: number) => void
  onViewport?: (bounds: LngLatBounds) => void
  /** A numbered plan pin was clicked (R-46-05). */
  onPlanStop?: (linkId: string, date: string) => void
  /** A day card was clicked, or Escape / the focused card ended the focus (R-46-07). */
  onFocusDay?: (date: string | null) => void
  /** A photo marker was clicked (R-47-07). */
  onPhoto?: (id: string) => void
  /** A planner dropped a dragged photo marker (R-47-09). */
  onPhotoMove?: (id: string, lng: number, lat: number) => void
}

type TripState = {
  trip: Trip
  spots: Spot[]
  total: number
  entries: PlanEntry[] | null
  selectedEntryId: string | null
}

export type LiveNotice = LiveChange & { actorName: string; token: number }

type TripContextValue = TripState & {
  setTrip: (trip: Trip) => void
  replaceSpots: (spots: Spot[], total: number) => void
  updateSpots: (fn: (spots: Spot[]) => Spot[]) => void
  setEntries: (entries: PlanEntry[]) => void
  setSelectedEntryId: (id: string | null) => void
  setScene: (scene: MapScene | null) => void
  scene: MapScene | null
  handlersRef: { current: MapHandlers }
  imageRevision: number
  notices: LiveNotice[]
  dismissNotice: (token: number) => void
  accessLost: boolean
  liveError: number
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
  const [imageRevision, setImageRevision] = useState(0)
  const [notices, setNotices] = useState<LiveNotice[]>([])
  const [accessLost, setAccessLost] = useState(false)
  const [liveError, setLiveError] = useState(0)
  const handlersRef = useRef<MapHandlers>(idleHandlers)
  const noticeToken = useRef(0)
  const membersRef = useRef(trip.members)
  membersRef.current = state.trip.members

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
  const dismissNotice = useCallback((token: number) => {
    setNotices((current) => current.filter((notice) => notice.token !== token))
  }, [])

  // The writer of a kind change gets no live event for it (own client id), so
  // re-list the spots whenever the trip's kinds change after the first load.
  const { kinds } = useTripKinds(trip.id)
  const kindsKey = kinds
    ? kinds
        .map((k) => `${k.id}:${k.name}:${k.color}:${k.symbol}:${k.sortOrder}`)
        .join('|')
    : null
  const seenKinds = useRef<string | null>(null)
  useEffect(() => {
    const previous = seenKinds.current
    seenKinds.current = kindsKey
    if (previous === null || kindsKey === null || previous === kindsKey) return
    let stale = false
    void listSpots(trip.id, defaultSpotListQuery)
      .then((result) => {
        if (!stale) replaceSpots(result.spots, result.total)
      })
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [kindsKey, replaceSpots, trip.id])

  useTripEvents(trip.id, {
    replaceSpots,
    setEntries,
    setTrip,
    bumpImages: () => setImageRevision((value) => value + 1),
    onNotices: (changes) => {
      const named = changes.map((change) => ({
        ...change,
        actorName:
          membersRef.current.find((member) => member.id === change.actorId)
            ?.name ?? '',
        token: noticeToken.current++,
      }))
      if (named.length === 0) return
      setNotices((current) => [...current, ...named])
    },
    onLostAccess: () => setAccessLost(true),
    onPollError: () => setLiveError((value) => value + 1),
  })

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
      imageRevision,
      notices,
      dismissNotice,
      accessLost,
      liveError,
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
      imageRevision,
      notices,
      dismissNotice,
      accessLost,
      liveError,
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
