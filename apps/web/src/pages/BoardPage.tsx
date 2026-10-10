import {
  normalizeSpotLink,
  parseSpotListQuery,
  spotListSearchParams,
  spotSchema,
  type Spot,
  type SpotDetail,
  type SpotListQuery,
  type SpotPlan,
} from '@tripboard/shared'
import { Plus } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useLocation, useParams, useSearchParams } from 'react-router'
import { Toast, type ToastMessage } from '../components/Toast'
import { ErrorState, PanelSkeleton } from '../components/states'
import { useConfirm } from '../components/ui/confirm'
import { Button } from '../components/ui/button'
import { activeLocale } from '../i18n'
import { useListFollowsMap } from '../list-follows-map'
import { ConflictDialog, type ConflictRow } from '../live/ConflictDialog'
import type { LiveNotice } from '../trips/trip-context'
import { boundsForPoints, type LngLatBounds } from '../map/bounds'
import type { MapSpot } from '../map/clusters'
import { addPlanSpot, listPlan, removePlanSpot } from '../plan/client'
import { useSession } from '../session'
import {
  createSpot,
  deleteSpot,
  getSpot,
  listSpots,
  reverseAddress,
  updateSpot,
} from '../spots/client'
import {
  draftFromSpot,
  draftsEqual,
  emptyDraft,
  pinCategory,
  switchDecision,
  type Draft,
} from '../spots/model'
import { SpotList } from '../spots/SpotList'
import { SpotPanel } from '../spots/SpotPanel'
import { onCommentsChanged } from '../comments/bus'
import { conflictOf, isAuth, isConflict, isInvalid } from '../api/http'
import { getTrip } from '../trips/client'
import { useMapScene, useTripData, type MapScene } from '../trips/trip-context'

const searchDebounceMs = 250
const noSpots: Spot[] = []

type Panel = {
  mode: 'add' | 'edit' | 'view'
  draft: Draft
  baseline: Draft
  spot: Spot | null
  plans: SpotPlan[]
  focusDiscussion?: boolean
}

export function BoardPage() {
  const { t, i18n } = useTranslation()
  const confirm = useConfirm()
  const { reload } = useSession()
  const { enabled: listFollowsMap } = useListFollowsMap()
  const { id } = useParams()
  const {
    trip,
    spots: allSpots,
    total: allTotal,
    entries,
    setEntries,
    setTrip,
    updateSpots,
    notices,
    dismissNotice,
    liveError,
  } = useTripData()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const linkedSpotId = params.get('spot')
  const paramKey = params.toString()
  const urlQuery = useMemo(
    () => parseSpotListQuery(paramKey, listFollowsMap),
    [listFollowsMap, paramKey],
  )
  const [query, setQuery] = useState(urlQuery)
  const queryRef = useRef(query)
  const keepList = useRef(false)
  queryRef.current = query
  const setParamsRef = useRef(setParams)
  setParamsRef.current = setParams
  const followsRef = useRef(listFollowsMap)
  followsRef.current = listFollowsMap
  const tRef = useRef(t)
  tRef.current = t
  const lang = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const [filtered, setFiltered] = useState<{
    spots: Spot[]
    total: number
  } | null>(null)
  const [listStatus, setListStatus] = useState<'ready' | 'loading' | 'error'>(
    'ready',
  )
  const [bounds, setBounds] = useState<LngLatBounds | null>(null)
  const [searchDraft, setSearchDraft] = useState(query.q)
  const searchDraftRef = useRef(searchDraft)
  searchDraftRef.current = searchDraft
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const detailEpoch = useRef(0)
  const [saving, setSaving] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [flyTo, setFlyTo] = useState<{
    token: string
    lng: number
    lat: number
  } | null>(null)
  const [importFocus, setImportFocus] = useState<{
    key: string
    bounds: LngLatBounds
  } | null>(null)
  const [toast, setToastState] = useState<ToastMessage | null>(null)
  const setToast = (message: string, kind: ToastMessage['kind'] = 'error') => {
    setToastState(message ? { message, kind } : null)
  }
  const [banner, setBanner] = useState<LiveNotice | null>(null)
  const [conflict, setConflict] = useState<{
    current: Spot
    updatedByName: string
    body: Parameters<typeof updateSpot>[1]
  } | null>(null)
  const [overlay, setOverlay] = useState<HTMLElement | null>(null)
  const seenLiveError = useRef(0)

  useLayoutEffect(() => {
    setOverlay(document.getElementById('trip-map-overlay'))
  }, [])

  useEffect(() => {
    if (liveError === seenLiveError.current) return
    seenLiveError.current = liveError
    setToast(t('board.loadError'))
  }, [liveError, t])

  useEffect(() => {
    if (notices.length === 0) return
    for (const notice of notices) {
      const aboutSpot = notice.resource === 'spot' || notice.resource === 'home'
      const open = panel?.spot?.id === notice.id
      if (!aboutSpot || !open || !panel?.spot) {
        dismissNotice(notice.token)
        continue
      }
      if (notice.action.endsWith('.delete')) {
        setPanel(null)
        setSelectedId(null)
        setBanner(null)
        setToast(
          t('live.deleted', { name: notice.actorName || t('live.someone') }),
          'info',
        )
      } else if (!draftsEqual(panel.draft, panel.baseline)) {
        setBanner(notice)
      } else {
        void refreshDetail(notice.id ?? panel.spot.id)
      }
      dismissNotice(notice.token)
    }
  }, [dismissNotice, notices, panel, t])

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
  const remote = needsRemoteList(query)

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    void listPlan(id, controller.signal)
      .then(setEntries)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isAuth(error)) reload()
      })
    return () => controller.abort()
  }, [id, reload, setEntries])

  useEffect(() => {
    if (!id || !remote) {
      setFiltered(null)
      setListStatus('ready')
      return
    }
    const controller = new AbortController()
    setListStatus('loading')
    const listQuery = queryRef.current
    void listSpots(id, listQuery, controller.signal)
      .then((result) => {
        setFiltered(result)
        setListStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isAuth(error)) {
          reload()
          return
        }
        setListStatus('error')
        setToast(tRef.current('board.loadError'))
      })
    return () => controller.abort()
  }, [filterKey, id, reload, remote])

  const spots = remote ? (filtered?.spots ?? noSpots) : allSpots
  const total = remote ? (filtered?.total ?? 0) : allTotal
  const tripId = id ?? trip.id
  const canEdit = trip.role !== 'visitor'
  const mapSpots = useMemo(() => toMapSpots(spots), [spots])
  const draftPin = useMemo(() => {
    if (!panel || panel.mode === 'view') return null
    if (panel.draft.lat == null || panel.draft.lng == null) return null
    return {
      lng: panel.draft.lng,
      lat: panel.draft.lat,
      category: pinCategory(panel.draft.baseCategory),
      filled: panel.draft.baseCategory === 'home' && panel.draft.primary,
    }
  }, [panel])
  const placing = panel != null && panel.mode !== 'view'
  const scene = useMemo<MapScene>(
    () => ({
      spots: mapSpots,
      selectedId,
      hoverId,
      placing,
      draft: draftPin,
      highlightIds: [],
      focus: importFocus,
      flyTo,
    }),
    [draftPin, flyTo, hoverId, importFocus, mapSpots, placing, selectedId],
  )

  function confirmDiscard(): Promise<boolean> {
    return confirm({
      title: t('confirm.discardTitle'),
      message: t('board.discard'),
      confirmLabel: t('confirm.discardAction'),
      danger: true,
    })
  }

  async function requestClose() {
    if (!panel) return
    if (!draftsEqual(panel.draft, panel.baseline)) {
      if (!(await confirmDiscard())) return
    }
    setPanel(null)
  }

  // Every way of leaving the open panel for another spot or a new one asks
  // here first: wait out a save, and confirm before dropping edits.
  async function mayLeavePanel(): Promise<boolean> {
    if (!panel) return true
    const decision = switchDecision({
      draft: panel.draft,
      baseline: panel.baseline,
      saving,
    })
    if (decision === 'ignore') return false
    return decision === 'switch' || (await confirmDiscard())
  }

  // A right-click on empty map: start a new spot there, or in a panel that
  // holds nothing but a placed pin, just move the pin.
  function contextAdd(lng: number, lat: number): boolean {
    if (!canEdit) return false
    if (panel && saving) return true
    if (panel?.mode === 'add' && onlyPlaced(panel.draft, panel.baseline)) {
      void place(lng, lat)
      return true
    }
    // The map only needs to know the click was handled; the answer may take
    // a confirm dialog.
    void mayLeavePanel().then((ok) => {
      if (!ok) return
      openAdd()
      void place(lng, lat)
    })
    return true
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

  function openSpot(spotId: string, focusDiscussion = false) {
    const spot = spots.find((item) => item.id === spotId)
    if (!spot) return
    if (panel?.spot?.id === spotId && !focusDiscussion) return
    void mayLeavePanel().then((ok) => {
      if (!ok) return
      const draft = draftFromSpot(spot)
      setSelectedId(spotId)
      setLinkError(null)
      setFormError(null)
      setFlyTo({
        token: `${spotId}-${Date.now()}`,
        lng: spot.lng,
        lat: spot.lat,
      })
      setPanel({
        mode: canEdit ? 'edit' : 'view',
        draft,
        baseline: draft,
        spot,
        plans: [],
        focusDiscussion,
      })
      void refreshDetail(spotId)
    })
  }

  // A News entry links here as ?spot=<id> and opens that spot's discussion.
  const openSpotRef = useRef(openSpot)
  openSpotRef.current = openSpot
  useEffect(() => {
    if (!linkedSpotId || !spots.some((spot) => spot.id === linkedSpotId)) return
    const focus = Boolean(
      (location.state as { discussion?: boolean } | null)?.discussion,
    )
    openSpotRef.current(linkedSpotId, focus)
    const next = new URLSearchParams(params)
    next.delete('spot')
    setParams(next, { replace: true, state: null })
  }, [linkedSpotId, location.state, params, setParams, spots])

  // A comment changed on a spot (here, or live elsewhere): refresh its counts.
  const changeSpotsRef = useRef<(fn: (current: Spot[]) => Spot[]) => void>(
    () => undefined,
  )
  useEffect(
    () =>
      onCommentsChanged((spotId) => {
        if (!spotId) return
        void getSpot(spotId)
          .then((detail) => {
            changeSpotsRef.current((current) =>
              current.map((spot) =>
                spot.id === detail.id
                  ? {
                      ...spot,
                      commentCount: detail.commentCount,
                      unreadComments: detail.unreadComments,
                    }
                  : spot,
              ),
            )
          })
          .catch(() => undefined)
      }),
    [],
  )

  async function refreshDetail(spotId: string) {
    const epoch = ++detailEpoch.current
    try {
      const detail = await getSpot(spotId)
      if (epoch !== detailEpoch.current) return
      applyDetail(detail)
    } catch (error) {
      if (isAuth(error)) reload()
    }
  }

  function applyDetail(detail: SpotDetail) {
    changeSpots((current) =>
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

  function changeSpots(fn: (current: Spot[]) => Spot[]) {
    updateSpots(fn)
    setFiltered((current) => {
      if (!current) return current
      const next = fn(current.spots)
      return { spots: next, total: next.length }
    })
  }
  changeSpotsRef.current = changeSpots

  function onImported(imported: Spot[]) {
    changeSpots((current) => [...current, ...imported])
    setToast(t('board.importSuccess', { count: imported.length }), 'info')
    const next = boundsForPoints(imported)
    if (next) setImportFocus({ key: `import-${Date.now()}`, bounds: next })
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
    const fullSnapshot = allSpots
    const mode = panel.mode
    const existing = panel.spot
    setSaving(true)
    setLinkError(null)
    setFormError(null)
    try {
      if (mode === 'add') {
        const tempId = temporaryId()
        changeSpots((current) => [
          ...current,
          optimistic(tripId, tempId, draft, existing, normalized.link),
        ])
        const saved = await createSpot(tripId, body)
        changeSpots((current) => placeSaved(current, saved, tempId))
        setSelectedId(saved.id)
      } else if (existing) {
        const spotId = existing.id
        changeSpots((current) =>
          current.map((spot) => {
            if (spot.id === spotId)
              return { ...spot, ...body, title: body.title }
            if (body.primary && spot.primary) return { ...spot, primary: false }
            return spot
          }),
        )
        const saved = await updateSpot(spotId, body, existing.updatedAt)
        changeSpots((current) => placeSaved(current, saved, spotId))
      }
      setPanel(null)
    } catch (error) {
      if (isAuth(error)) {
        reload()
        return
      }
      updateSpots(() => fullSnapshot)
      setFiltered(remote ? { spots: snapshot, total: snapshot.length } : null)
      if (isConflict(error) && existing) {
        const { current, updatedBy } = conflictOf(error, spotSchema)
        setConflict({
          current,
          updatedByName: updatedBy?.name ?? '',
          body,
        })
        return
      }
      if (isInvalid(error) && error.fields.link) {
        setLinkError(error.fields.link)
      }
      setFormError(t('board.saveError'))
      setToast(t('board.saveError'))
      return
    } finally {
      setSaving(false)
    }
    try {
      setTrip(await getTrip(tripId))
    } catch (error) {
      if (isAuth(error)) reload()
    }
  }

  async function remove() {
    if (!panel?.spot) return
    const spotId = panel.spot.id
    const snapshot = spots
    const fullSnapshot = allSpots
    setSaving(true)
    setPanel(null)
    changeSpots((current) => current.filter((spot) => spot.id !== spotId))
    if (selectedId === spotId) setSelectedId(null)
    try {
      await deleteSpot(spotId)
    } catch (error) {
      if (isAuth(error)) {
        reload()
        return
      }
      updateSpots(() => fullSnapshot)
      setFiltered(remote ? { spots: snapshot, total: snapshot.length } : null)
      setToast(t('board.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function useMine() {
    if (!conflict || !panel?.spot) return
    const spotId = panel.spot.id
    setSaving(true)
    try {
      const saved = await updateSpot(spotId, conflict.body)
      changeSpots((current) => placeSaved(current, saved, spotId))
      setConflict(null)
      setBanner(null)
      setPanel(null)
    } catch (error) {
      if (isAuth(error)) {
        reload()
        return
      }
      setToast(t('board.saveError'))
    } finally {
      setSaving(false)
    }
  }

  function useTheirs() {
    if (!conflict) return
    const draft = draftFromSpot(conflict.current)
    const saved = conflict.current
    changeSpots((current) => placeSaved(current, saved, saved.id))
    setPanel((current) =>
      current
        ? {
            ...current,
            spot: saved,
            draft,
            baseline: draft,
            plans: current.plans,
          }
        : current,
    )
    setConflict(null)
    setBanner(null)
  }

  async function reloadTheirs() {
    if (!panel?.spot) return
    const detail = await getSpot(panel.spot.id)
    const draft = draftFromSpot(detail)
    changeSpots((current) => placeSaved(current, detail, detail.id))
    setPanel((current) =>
      current && current.spot?.id === detail.id
        ? {
            ...current,
            spot: detail,
            plans: detail.plans,
            draft,
            baseline: draft,
          }
        : current,
    )
    setBanner(null)
  }

  function updateQuery(next: SpotListQuery) {
    setQuery(next)
    setSearchDraft(next.q)
    setParams(spotListSearchParams(next, listFollowsMap), { replace: true })
  }

  useMapScene(scene, {
    onSelect: openSpot,
    onHover: setHoverId,
    onPlace: (lng, lat) => {
      void place(lng, lat)
    },
    onContextPlace: contextAdd,
    onDraftMove: (lng, lat) => {
      void place(lng, lat)
    },
    onViewport: setBounds,
  })

  const addButton = canEdit ? (
    <Button
      data-testid="add-new"
      className="pointer-events-auto absolute bottom-36 left-4 z-10 shadow-panel sm:bottom-12"
      onClick={openAdd}
    >
      <Plus aria-hidden="true" className="size-4" />
      {t('board.addNew')}
    </Button>
  ) : null

  if (!remote || listStatus === 'ready') keepList.current = true
  const blockList = remote && !filtered && !keepList.current

  return (
    <>
      {overlay && addButton ? createPortal(addButton, overlay) : null}
      {listStatus === 'error' && blockList ? (
        <div className="p-4">
          <ErrorState retry={() => setListStatus('loading')} />
        </div>
      ) : listStatus === 'loading' && blockList ? (
        <PanelSkeleton />
      ) : (
        <SpotList
          tripId={tripId}
          tripName={trip.name}
          timeZone={trip.timezone}
          lang={lang}
          spots={spots}
          existingSpots={allSpots}
          canImport={canEdit}
          total={total}
          bounds={bounds}
          query={query}
          members={trip.members}
          entries={entries ?? []}
          searchDraft={searchDraft}
          onSearchDraft={setSearchDraft}
          onQuery={updateQuery}
          selectedId={selectedId}
          onSelect={openSpot}
          onHover={setHoverId}
          onImported={onImported}
          onAuthError={reload}
        />
      )}
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
          entries={entries ?? []}
          onDraft={changeDraft}
          onClose={() => void requestClose()}
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
              if (isAuth(error)) {
                reload()
                return
              }
              setToast(t('board.saveError'))
              throw error
            }
          }}
          onToast={(message) => setToast(message)}
          focusDiscussion={panel.focusDiscussion}
          onRemoveFromPlan={async (entryId, linkId) => {
            if (!panel.spot) return
            const spotId = panel.spot.id
            try {
              await removePlanSpot(entryId, linkId)
              await refreshDetail(spotId)
            } catch (error) {
              if (isAuth(error)) {
                reload()
                return
              }
              setToast(t('board.saveError'))
            }
          }}
        />
      ) : null}
      {banner ? (
        <div
          role="status"
          data-testid="live-banner"
          className="fixed left-4 right-4 top-20 z-50 flex flex-wrap items-center gap-2 rounded-[8px] border border-border bg-background p-3 shadow-panel sm:left-auto sm:right-4 sm:w-[360px]"
        >
          <p className="text-sm">
            {t('live.changed', {
              name: banner.actorName || t('live.someone'),
            })}
          </p>
          <Button
            type="button"
            data-testid="live-reload"
            onClick={() => {
              void reloadTheirs()
            }}
          >
            {t('live.reload')}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="live-keep"
            onClick={() => setBanner(null)}
          >
            {t('live.keep')}
          </Button>
        </div>
      ) : null}
      {conflict ? (
        <ConflictDialog
          name={conflict.updatedByName}
          rows={spotConflictRows(t, conflict.body, conflict.current)}
          onMine={() => {
            void useMine()
          }}
          onTheirs={useTheirs}
        />
      ) : null}
      {toast ? <Toast toast={toast} onClose={() => setToast('')} /> : null}
    </>
  )
}

function spotConflictRows(
  t: (key: string) => string,
  mine: {
    title?: string
    address?: string | null
    info?: string | null
    link?: string | null
    baseCategory?: string
  },
  theirs: Spot,
): ConflictRow[] {
  const pairs: Array<[string, string, string]> = [
    [t('board.spotTitle'), mine.title ?? '', theirs.title],
    [t('board.address'), mine.address ?? '', theirs.address ?? ''],
    [t('board.info'), mine.info ?? '', theirs.info ?? ''],
    [t('board.link'), mine.link ?? '', theirs.link ?? ''],
    [t('board.category'), mine.baseCategory ?? '', theirs.baseCategory],
  ]
  return pairs
    .filter(([, left, right]) => left !== right)
    .map(([label, left, right]) => ({ label, mine: left, theirs: right }))
}

function onlyPlaced(draft: Draft, baseline: Draft): boolean {
  if (draft.lat == null || draft.lng == null)
    return draftsEqual(draft, baseline)
  return draftsEqual(
    {
      ...draft,
      lat: baseline.lat,
      lng: baseline.lng,
      address: baseline.address,
    },
    baseline,
  )
}

function needsRemoteList(query: SpotListQuery): boolean {
  return (
    query.q.trim().length > 0 ||
    query.cat.length > 0 ||
    query.status !== 'all' ||
    query.by != null ||
    query.entry != null ||
    query.sort !== 'scheduled'
  )
}

function toMapSpots(spots: Spot[]): MapSpot[] {
  return spots.map((spot) => ({
    id: spot.id,
    title: spot.title,
    subtitle: spot.address ?? '',
    category: pinCategory(spot.displayCategory),
    lng: spot.lng,
    lat: spot.lat,
    primary: spot.primary,
    unread: spot.unreadComments > 0,
  }))
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
    commentCount: previous?.commentCount ?? 0,
    unreadComments: previous?.unreadComments ?? 0,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  }
}
