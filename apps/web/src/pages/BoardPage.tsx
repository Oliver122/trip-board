import {
  normalizeSpotLink,
  parseSpotListQuery,
  spotListSearchParams,
  type PlanEntry,
  type Spot,
  type SpotDetail,
  type SpotListQuery,
  type SpotPlan,
} from '@tripboard/shared'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { ErrorState, LoadingState } from '../components/states'
import { Button } from '../components/ui/button'
import { activeLocale } from '../i18n'
import { useListFollowsMap } from '../list-follows-map'
import type { LngLatBounds } from '../map/bounds'
import { MapView } from '../map/MapView'
import { parseTrip, type TripMapData } from '../map/trip'
import { useSession } from '../session'
import { AuthError, getTrip } from '../trips/client'
import { addPlanSpot, listPlan, removePlanSpot } from '../plan/client'
import {
  createSpot,
  deleteSpot,
  getSpot,
  listSpots,
  reverseAddress,
  SaveError,
  updateSpot,
} from '../spots/client'
import { viewportStorageKey } from '../map/viewport'
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
  plans: SpotPlan[]
}

export function BoardPage() {
  const { t, i18n } = useTranslation()
  const { reload } = useSession()
  const { enabled: listFollowsMap } = useListFollowsMap()
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const paramKey = params.toString()
  const urlQuery = useMemo(
    () => parseSpotListQuery(paramKey, listFollowsMap),
    [listFollowsMap, paramKey],
  )
  const [query, setQuery] = useState(urlQuery)
  const queryRef = useRef(query)
  queryRef.current = query
  const setParamsRef = useRef(setParams)
  setParamsRef.current = setParams
  const followsRef = useRef(listFollowsMap)
  followsRef.current = listFollowsMap
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
  const [entries, setEntries] = useState<PlanEntry[]>([])
  const detailEpoch = useRef(0)
  const [saving, setSaving] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [flyTo, setFlyTo] = useState<{
    token: string
    lng: number
    lat: number
  } | null>(null)
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
      setParamsRef.current(spotListSearchParams(next, followsRef.current), {
        replace: true,
      })
    }, searchDebounceMs)
    return () => window.clearTimeout(timer)
  }, [searchDraft])

  const filterKey = `${query.q}\n${query.cat.join(',')}\n${query.status}\n${query.by ?? ''}\n${query.entry ?? ''}\n${query.sort}`

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
    void listPlan(id, controller.signal)
      .then(setEntries)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof AuthError) reload()
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
    setParams(spotListSearchParams(next, listFollowsMap), { replace: true })
  }

  const canEdit = trip.role !== 'visitor'
  const mapSpots = spots.map((spot) => ({
    id: spot.id,
    title: spot.title,
    subtitle: spot.address ?? '',
    category: pinCategory(spot.displayCategory),
    lng: spot.lng,
    lat: spot.lat,
    primary: spot.primary,
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
    setLinkError(null)
    setFormError(null)
    setPanel({
      mode: 'add',
      draft: emptyDraft,
      baseline: emptyDraft,
      spot: null,
      plans: [],
    })
  }

  function openSpot(spotId: string) {
    const spot = spots.find((item) => item.id === spotId)
    if (!spot) return
    const draft = draftFromSpot(spot)
    setSelectedId(spotId)
    setLinkError(null)
    setFormError(null)
    setFlyTo({ token: `${spotId}-${Date.now()}`, lng: spot.lng, lat: spot.lat })
    setPanel({
      mode: canEdit ? 'edit' : 'view',
      draft,
      baseline: draft,
      spot,
      plans: [],
    })
    void refreshDetail(spotId)
  }

  async function refreshDetail(spotId: string) {
    const epoch = ++detailEpoch.current
    try {
      const detail = await getSpot(spotId)
      if (epoch !== detailEpoch.current) return
      applyDetail(detail)
    } catch (error) {
      if (error instanceof AuthError) reload()
    }
  }

  function applyDetail(detail: SpotDetail) {
    setSpots((current) =>
      current.map((spot) => (spot.id === detail.id ? detail : spot)),
    )
    setPanel((current) => {
      if (!current || current.spot?.id !== detail.id) return current
      const draft = draftFromSpot(detail)
      return {
        ...current,
        spot: detail,
        plans: detail.plans,
        draft: draftsEqual(current.draft, current.baseline)
          ? draft
          : current.draft,
        baseline: draft,
      }
    })
  }

  function changeDraft(draft: Draft) {
    setLinkError(null)
    setFormError(null)
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
    const normalized = normalizeSpotLink(panel.draft.link)
    if ('error' in normalized) {
      setLinkError(normalized.error)
      setFormError(null)
      return
    }
    const draft = panel.draft
    const body = {
      title: draft.title.trim(),
      lat,
      lng,
      baseCategory: draft.baseCategory,
      address: blank(draft.address),
      info: blank(draft.info),
      link: normalized.link,
      stayFrom: draft.baseCategory === 'home' ? blank(draft.stayFrom) : null,
      stayTo: draft.baseCategory === 'home' ? blank(draft.stayTo) : null,
      primary: draft.baseCategory === 'home' && draft.primary,
    }
    const snapshot = spots
    const mode = panel.mode
    const existing = panel.spot
    setSaving(true)
    setLinkError(null)
    setFormError(null)
    try {
      if (mode === 'add') {
        const tempId = temporaryId()
        setSpots((current) => [
          ...current,
          optimistic(tripId, tempId, draft, existing, normalized.link),
        ])
        const saved = await createSpot(tripId, body)
        setSpots((current) => placeSaved(current, saved, tempId))
        setSelectedId(saved.id)
      } else if (existing) {
        const spotId = existing.id
        setSpots((current) =>
          current.map((spot) => {
            if (spot.id === spotId) {
              return { ...spot, ...body, title: body.title }
            }
            if (body.primary && spot.primary) return { ...spot, primary: false }
            return spot
          }),
        )
        const saved = await updateSpot(spotId, body)
        setSpots((current) => placeSaved(current, saved, spotId))
      }
      setPanel(null)
    } catch (error) {
      if (error instanceof AuthError) {
        reload()
        return
      }
      setSpots(snapshot)
      if (error instanceof SaveError && error.fields.link) {
        setLinkError(error.fields.link)
      }
      setFormError(t('board.saveError'))
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
    <div className="relative flex min-h-0 flex-1 flex-col sm:flex-row">
      <div className="relative min-h-0 flex-1">
        <MapView
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
                  filled:
                    panel.draft.baseCategory === 'home' && panel.draft.primary,
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
          viewportScope="board"
          viewportStorageKey={viewportStorageKey('board', tripId)}
          flyTo={flyTo}
        />
        {canEdit ? (
          <Button
            data-testid="add-new"
            className="absolute bottom-36 left-4 z-10 shadow-panel sm:bottom-12"
            onClick={openAdd}
          >
            <Plus aria-hidden="true" className="size-4" />
            {t('board.addNew')}
          </Button>
        ) : null}
      </div>
      <SpotList
        tripId={tripId}
        tripName={trip.name}
        spots={spots}
        total={total}
        bounds={bounds}
        query={query}
        members={trip.members}
        entries={entries}
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
          linkError={linkError}
          formError={formError}
          spot={panel.spot}
          spots={spots}
          plans={panel.plans}
          entries={entries}
          onDraft={changeDraft}
          onClose={requestClose}
          onSubmit={() => {
            void save()
          }}
          onDelete={() => {
            void remove()
          }}
          onAddToPlan={async (input) => {
            if (!panel.spot) return
            const spotId = panel.spot.id
            try {
              await addPlanSpot(input.entryId, {
                spotId,
                visitDate: input.visitDate,
                visitTime: input.visitTime,
              })
              await refreshDetail(spotId)
            } catch (error) {
              if (error instanceof AuthError) {
                reload()
                return
              }
              setToast(t('board.saveError'))
              throw error
            }
          }}
          onRemoveFromPlan={async (entryId, linkId) => {
            if (!panel.spot) return
            const spotId = panel.spot.id
            try {
              await removePlanSpot(entryId, linkId)
              await refreshDetail(spotId)
            } catch (error) {
              if (error instanceof AuthError) {
                reload()
                return
              }
              setToast(t('board.saveError'))
            }
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

function temporaryId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return `temp-${hex}`
}

function placeSaved(spots: Spot[], saved: Spot, replaceId: string): Spot[] {
  return spots.map((spot) => {
    if (spot.id === replaceId || spot.id === saved.id) return saved
    if (saved.primary && spot.primary) return { ...spot, primary: false }
    return spot
  })
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
  link: string | null,
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
    stayFrom: draft.baseCategory === 'home' ? blank(draft.stayFrom) : null,
    stayTo: draft.baseCategory === 'home' ? blank(draft.stayTo) : null,
    primary: draft.baseCategory === 'home' && draft.primary,
    info: blank(draft.info),
    link,
    createdBy: previous?.createdBy ?? null,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  }
}
