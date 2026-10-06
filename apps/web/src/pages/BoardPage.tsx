import {
  parseSpotListQuery,
  spotListSearchParams,
  type Spot,
  type SpotListQuery,
} from '@tripboard/shared'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { ErrorState, LoadingState } from '../components/states'
import { Button } from '../components/ui/button'
import { activeLocale } from '../i18n'
import type { LngLatBounds } from '../map/bounds'
import { TripMap } from '../map/TripMap'
import { parseTrip, type TripMapData } from '../map/trip'
import { useSession } from '../session'
import { AuthError, getTrip } from '../trips/client'
import {
  createSpot,
  deleteSpot,
  listSpots,
  reverseAddress,
  updateSpot,
} from '../spots/client'
import {
  draftFromSpot,
  draftsEqual,
  emptyDraft,
  pinCategory,
  type Draft,
} from '../spots/model'
import { SpotList } from '../spots/SpotList'
import { SpotPanel } from '../spots/SpotPanel'

const searchDebounceMs = 250

type Panel = {
  mode: 'add' | 'edit' | 'view'
  draft: Draft
  baseline: Draft
  spot: Spot | null
}

export function BoardPage() {
  const { t, i18n } = useTranslation()
  const { reload } = useSession()
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const paramKey = params.toString()
  const urlQuery = useMemo(() => parseSpotListQuery(paramKey), [paramKey])
  const [query, setQuery] = useState(urlQuery)
  const queryRef = useRef(query)
  queryRef.current = query
  const setParamsRef = useRef(setParams)
  setParamsRef.current = setParams
  const tRef = useRef(t)
  tRef.current = t
  const lang = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [trip, setTrip] = useState<TripMapData | null>(null)
  const [spots, setSpots] = useState<Spot[]>([])
  const [total, setTotal] = useState(0)
  const [bounds, setBounds] = useState<LngLatBounds | null>(null)
  const [searchDraft, setSearchDraft] = useState(query.q)
  const searchDraftRef = useRef(searchDraft)
  searchDraftRef.current = searchDraft
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    setQuery(urlQuery)
  }, [urlQuery])

  useEffect(() => {
    setSearchDraft(query.q)
  }, [query.q])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = queryRef.current
      const trimmed = searchDraftRef.current.trim()
      if (trimmed === current.q) return
      const next = { ...current, q: trimmed }
      setQuery(next)
      setParamsRef.current(spotListSearchParams(next), { replace: true })
    }, searchDebounceMs)
    return () => window.clearTimeout(timer)
  }, [searchDraft])

  const filterKey = `${query.q}\n${query.cat.join(',')}\n${query.status}\n${query.by ?? ''}\n${query.sort}`

  useEffect(() => {
    if (!id) {
      setStatus('error')
      return
    }
    const controller = new AbortController()
    setStatus('loading')
    setTrip(null)
    void fetch(`/api/trips/${id}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) throw new AuthError()
        if (!response.ok) throw new Error('load')
        return response.json() as Promise<unknown>
      })
      .then((body) => {
        const parsed = parseTrip(body)
        if (!parsed) {
          setStatus('error')
          return
        }
        setTrip(parsed)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof AuthError) {
          reload()
          return
        }
        setStatus('error')
      })
    return () => controller.abort()
  }, [attempt, id, reload])

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    const listQuery = queryRef.current
    void listSpots(id, listQuery, controller.signal)
      .then((result) => {
        setSpots(result.spots)
        setTotal(result.total)
        setStatus((current) => (current === 'error' ? current : 'ready'))
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof AuthError) {
          reload()
          return
        }
        setStatus((current) => {
          if (current === 'ready') {
            setToast(tRef.current('board.loadError'))
            return current
          }
          return 'error'
        })
      })
    return () => controller.abort()
  }, [attempt, filterKey, id, reload])

  if (status === 'error' || !id) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <ErrorState retry={() => setAttempt((value) => value + 1)} />
      </div>
    )
  }
  if (status !== 'ready' || !trip) {
    return (
      <div className="p-8">
        <LoadingState />
      </div>
    )
  }
  const tripId = id

  function updateQuery(next: SpotListQuery) {
    setQuery(next)
    setSearchDraft(next.q)
    setParams(spotListSearchParams(next), { replace: true })
  }

  const canEdit = trip.role !== 'visitor'
  const mapSpots = spots.map((spot) => ({
    id: spot.id,
    title: spot.title,
    subtitle: spot.address ?? '',
    category: pinCategory(spot.displayCategory),
    lng: spot.lng,
    lat: spot.lat,
  }))

  function requestClose() {
    if (!panel) return
    if (!draftsEqual(panel.draft, panel.baseline)) {
      if (!window.confirm(t('board.discard'))) return
    }
    setPanel(null)
  }

  function openAdd() {
    setSelectedId(null)
    setPanel({
      mode: 'add',
      draft: emptyDraft,
      baseline: emptyDraft,
      spot: null,
    })
  }

  function openSpot(spotId: string) {
    const spot = spots.find((item) => item.id === spotId)
    if (!spot) return
    const draft = draftFromSpot(spot)
    setSelectedId(spotId)
    setPanel({
      mode: canEdit ? 'edit' : 'view',
      draft,
      baseline: draft,
      spot,
    })
  }

  function changeDraft(draft: Draft) {
    setPanel((current) => (current ? { ...current, draft } : current))
  }

  async function place(lng: number, lat: number) {
    setPanel((current) =>
      current && current.mode !== 'view'
        ? { ...current, draft: { ...current.draft, lng, lat } }
        : current,
    )
    const placeResult = await reverseAddress(lat, lng, lang)
    if (!placeResult) return
    setPanel((current) => {
      if (!current || current.mode === 'view') return current
      if (current.draft.lng !== lng || current.draft.lat !== lat) return current
      return {
        ...current,
        draft: { ...current.draft, address: placeResult.label, lng, lat },
      }
    })
  }

  async function save() {
    if (!panel) return
    const lat = panel.draft.lat
    const lng = panel.draft.lng
    if (lat == null || lng == null) return
    const draft = panel.draft
    const body = {
      title: draft.title.trim(),
      lat,
      lng,
      baseCategory: draft.baseCategory,
      address: blank(draft.address),
      info: blank(draft.info),
      link: blank(draft.link),
    }
    const snapshot = spots
    setSaving(true)
    setPanel(null)
    try {
      if (panel.mode === 'add') {
        const tempId = `temp-${crypto.randomUUID()}`
        setSpots((current) => [
          ...current,
          optimistic(tripId, tempId, draft, panel.spot),
        ])
        const saved = await createSpot(tripId, body)
        setSpots((current) =>
          current.map((spot) => (spot.id === tempId ? saved : spot)),
        )
        setSelectedId(saved.id)
      } else if (panel.spot) {
        const spotId = panel.spot.id
        setSpots((current) =>
          current.map((spot) =>
            spot.id === spotId ? { ...spot, ...body, title: body.title } : spot,
          ),
        )
        const saved = await updateSpot(spotId, body)
        setSpots((current) =>
          current.map((spot) => (spot.id === saved.id ? saved : spot)),
        )
      }
    } catch (error) {
      if (error instanceof AuthError) {
        reload()
        return
      }
      setSpots(snapshot)
      setToast(t('board.saveError'))
      return
    } finally {
      setSaving(false)
    }
    try {
      const refreshed = parseTrip(await getTrip(tripId))
      if (refreshed) setTrip(refreshed)
    } catch (error) {
      if (error instanceof AuthError) reload()
    }
  }

  async function remove() {
    if (!panel?.spot) return
    const spotId = panel.spot.id
    const snapshot = spots
    setSaving(true)
    setPanel(null)
    setSpots((current) => current.filter((spot) => spot.id !== spotId))
    if (selectedId === spotId) setSelectedId(null)
    try {
      await deleteSpot(spotId)
    } catch (error) {
      if (error instanceof AuthError) {
        reload()
        return
      }
      setSpots(snapshot)
      setToast(t('board.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="relative min-h-[50vh] flex-1 lg:min-h-0">
        <TripMap
          bbox={trip.bbox}
          spots={mapSpots}
          selectedId={selectedId}
          hoverId={hoverId}
          placing={panel != null && panel.mode !== 'view'}
          draft={
            panel &&
            panel.mode !== 'view' &&
            panel.draft.lat != null &&
            panel.draft.lng != null
              ? {
                  lng: panel.draft.lng,
                  lat: panel.draft.lat,
                  category: pinCategory(panel.draft.baseCategory),
                }
              : null
          }
          onSelect={openSpot}
          onHover={setHoverId}
          onPlace={(lng, lat) => {
            void place(lng, lat)
          }}
          onDraftMove={(lng, lat) => {
            void place(lng, lat)
          }}
          onViewport={setBounds}
        />
        {canEdit ? (
          <Button
            data-testid="add-new"
            className="absolute bottom-12 left-4 z-10 shadow-panel"
            onClick={openAdd}
          >
            <Plus aria-hidden="true" className="size-4" />
            {t('board.addNew')}
          </Button>
        ) : null}
      </div>
      <SpotList
        spots={spots}
        total={total}
        bounds={bounds}
        query={query}
        members={trip.members}
        searchDraft={searchDraft}
        onSearchDraft={setSearchDraft}
        onQuery={updateQuery}
        selectedId={selectedId}
        onSelect={openSpot}
        onHover={setHoverId}
      />
      {panel ? (
        <SpotPanel
          mode={panel.mode}
          draft={panel.draft}
          tripId={tripId}
          lang={lang}
          saving={saving}
          spot={panel.spot}
          onDraft={changeDraft}
          onClose={requestClose}
          onSubmit={() => {
            void save()
          }}
          onDelete={() => {
            void remove()
          }}
        />
      ) : null}
      {toast ? (
        <p
          role="alert"
          data-testid="toast"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-card bg-foreground px-4 py-3 text-background shadow-panel"
        >
          {toast}
        </p>
      ) : null}
    </div>
  )
}

function blank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function optimistic(
  tripId: string,
  id: string,
  draft: Draft,
  previous: Spot | null,
): Spot {
  const now = new Date().toISOString()
  return {
    id,
    tripId,
    title: draft.title.trim(),
    address: blank(draft.address),
    lat: draft.lat ?? 0,
    lng: draft.lng ?? 0,
    baseCategory: draft.baseCategory,
    displayCategory: draft.baseCategory,
    planCount: previous?.planCount ?? 0,
    firstScheduledAt: previous?.firstScheduledAt ?? null,
    info: blank(draft.info),
    link: blank(draft.link),
    createdBy: previous?.createdBy ?? null,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  }
}
