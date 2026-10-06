import {
  defaultSpotListQuery,
  normalizePlanDraft,
  normalizeSpotLink,
  type PlanDraft,
  type PlanEntry,
  type PlanEntryType,
  type Spot,
} from '@tripboard/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { Button } from '../components/ui/button'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { activeLocale } from '../i18n'
import { boundsForPoints } from '../map/bounds'
import { MapView } from '../map/MapView'
import { parseTrip, type TripMapData } from '../map/trip'
import { EntryDialog } from '../plan/EntryDialog'
import {
  addPlanSpot,
  createPlanEntry,
  deletePlanEntry,
  listPlan,
  removePlanSpot,
  reorderPlanSpots,
  updatePlanEntry,
  type PlanWrite,
} from '../plan/client'
import { ScheduleList } from '../plan/ScheduleList'
import {
  draftsEqual,
  emptyDraft as emptySpotDraft,
  pinCategory,
  type Draft,
} from '../spots/model'
import { SpotPanel } from '../spots/SpotPanel'
import {
  createSpot,
  listSpots,
  reverseAddress,
  SaveError,
} from '../spots/client'
import { useSession } from '../session'
import { AuthError, getTrip } from '../trips/client'

type DialogState =
  { mode: 'create'; type: PlanEntryType } | { mode: 'edit'; entry: PlanEntry }

type SpotPanelState = {
  draft: Draft
  baseline: Draft
}

export function SchedulePage() {
  const { t, i18n } = useTranslation()
  const { reload } = useSession()
  const { id } = useParams()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [trip, setTrip] = useState<TripMapData | null>(null)
  const [entries, setEntries] = useState<PlanEntry[]>([])
  const [spots, setSpots] = useState<Spot[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [spotPanel, setSpotPanel] = useState<SpotPanelState | null>(null)
  const [spotSaving, setSpotSaving] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [spotError, setSpotError] = useState<string | null>(null)
  const [createdSpot, setCreatedSpot] = useState<{
    entryId: string
    spotId: string
  } | null>(null)
  const creatingFor = useRef<string | null>(null)
  const lang = activeLocale(i18n.resolvedLanguage ?? i18n.language)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!id) {
      setStatus('error')
      return
    }
    const controller = new AbortController()
    setStatus('loading')
    void Promise.all([
      getTrip(id, controller.signal),
      listPlan(id, controller.signal),
      listSpots(id, defaultSpotListQuery, controller.signal),
    ])
      .then(([loaded, plan, spotList]) => {
        const parsed = parseTrip(loaded)
        if (!parsed) {
          setStatus('error')
          return
        }
        setTrip(parsed)
        setEntries(plan)
        setSpots(spotList.spots)
        setStatus('ready')
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

  const focus = useMemo(() => {
    const entry = entries.find((item) => item.id === selectedId)
    if (!entry) return null
    const points = entry.spots.flatMap((link) => {
      const spot = spots.find((item) => item.id === link.spotId)
      return spot ? [{ lat: spot.lat, lng: spot.lng }] : []
    })
    const bounds = boundsForPoints(points)
    if (!bounds) return null
    return { key: entry.id, bounds }
  }, [entries, selectedId, spots])

  const highlightIds = useMemo(() => {
    const entry = entries.find((item) => item.id === selectedId)
    return entry ? entry.spots.map((link) => link.spotId) : []
  }, [entries, selectedId])

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
  const canEdit = trip.role !== 'visitor'

  function changeSpotDraft(draft: Draft) {
    setLinkError(null)
    setSpotError(null)
    setSpotPanel((current) => (current ? { ...current, draft } : current))
  }

  async function place(lng: number, lat: number) {
    setSpotPanel((current) =>
      current ? { ...current, draft: { ...current.draft, lng, lat } } : current,
    )
    const placeResult = await reverseAddress(lat, lng, lang)
    if (!placeResult) return
    setSpotPanel((current) => {
      if (!current) return current
      if (current.draft.lng !== lng || current.draft.lat !== lat) return current
      return {
        ...current,
        draft: { ...current.draft, address: placeResult.label, lng, lat },
      }
    })
  }

  async function saveSpot() {
    if (!spotPanel) return
    const lat = spotPanel.draft.lat
    const lng = spotPanel.draft.lng
    if (lat == null || lng == null) return
    const normalized = normalizeSpotLink(spotPanel.draft.link)
    if ('error' in normalized) {
      setLinkError(normalized.error)
      setSpotError(null)
      return
    }
    const draft = spotPanel.draft
    const entryId = creatingFor.current
    setSpotSaving(true)
    setLinkError(null)
    setSpotError(null)
    try {
      const saved = await createSpot(tripId, {
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
      })
      setSpots((current) => [...current, saved])
      if (entryId) setCreatedSpot({ entryId, spotId: saved.id })
      setSpotPanel(null)
    } catch (error) {
      if (error instanceof AuthError) {
        reload()
        return
      }
      if (error instanceof SaveError && error.fields.link) {
        setLinkError(error.fields.link)
      }
      setSpotError(t('board.saveError'))
    } finally {
      setSpotSaving(false)
    }
  }
  const mapSpots = spots.map((spot) => ({
    id: spot.id,
    title: spot.title,
    subtitle: spot.address ?? '',
    category: pinCategory(spot.displayCategory),
    lng: spot.lng,
    lat: spot.lat,
    primary: spot.primary,
  }))

  async function refresh() {
    const [plan, spotList] = await Promise.all([
      listPlan(tripId),
      listSpots(tripId, defaultSpotListQuery),
    ])
    setEntries(plan)
    setSpots(spotList.spots)
  }

  function fail(error: unknown) {
    if (error instanceof AuthError) {
      reload()
      return
    }
    setToast(t('schedule.saveError'))
  }

  async function save(draft: PlanDraft) {
    if (!dialog) return
    setSaving(true)
    try {
      const body = writeBody(draft)
      if (dialog.mode === 'create') await createPlanEntry(tripId, body)
      else await updatePlanEntry(dialog.entry.id, body)
      await refresh()
      setDialog(null)
    } catch (error) {
      fail(error)
    } finally {
      setSaving(false)
    }
  }

  async function removeEntry() {
    if (dialog?.mode !== 'edit') return
    setSaving(true)
    try {
      await deletePlanEntry(dialog.entry.id)
      if (selectedId === dialog.entry.id) setSelectedId(null)
      await refresh()
      setDialog(null)
    } catch (error) {
      fail(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section className="flex max-h-[50vh] min-h-0 w-full flex-col overflow-auto border-b border-border lg:max-h-none lg:w-[420px] lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <h1 className="mr-auto text-xl font-semibold">
            {t('schedule.title')}
          </h1>
          {canEdit ? (
            <>
              <Button
                data-testid="add-bucket"
                onClick={() => setDialog({ mode: 'create', type: 'bucket' })}
              >
                {t('schedule.addBucket')}
              </Button>
              <Button
                variant="outline"
                data-testid="add-single"
                onClick={() => setDialog({ mode: 'create', type: 'single' })}
              >
                {t('schedule.addSingle')}
              </Button>
            </>
          ) : null}
        </div>
        {entries.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t('schedule.empty')} />
          </div>
        ) : (
          <ScheduleList
            entries={entries}
            spots={spots}
            canEdit={canEdit}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEdit={(entry) => setDialog({ mode: 'edit', entry })}
            onAddSpot={async (entryId, body) => {
              try {
                await addPlanSpot(entryId, body)
                await refresh()
              } catch (error) {
                fail(error)
                throw error
              }
            }}
            onRemoveSpot={async (entryId, linkId) => {
              try {
                await removePlanSpot(entryId, linkId)
                await refresh()
              } catch (error) {
                fail(error)
              }
            }}
            onCreateSpot={(entryId, query) => {
              creatingFor.current = entryId
              const draft = { ...emptySpotDraft, title: query.trim() }
              setLinkError(null)
              setSpotError(null)
              setSpotPanel({ draft, baseline: draft })
            }}
            createdSpot={createdSpot}
            onReorder={async (entryId, linkIds) => {
              const previous = entries
              setEntries((current) =>
                current.map((entry) =>
                  entry.id === entryId ? reorderLocally(entry, linkIds) : entry,
                ),
              )
              try {
                await reorderPlanSpots(entryId, linkIds)
              } catch (error) {
                setEntries(previous)
                fail(error)
              }
            }}
          />
        )}
      </section>
      <div className="relative min-h-[40vh] flex-1">
        <MapView
          bbox={trip.bbox}
          spots={mapSpots}
          selectedId={null}
          hoverId={null}
          highlightIds={highlightIds}
          focus={focus}
          onSelect={() => undefined}
          onHover={() => undefined}
          placing={spotPanel != null}
          viewportScope="schedule"
          draft={
            spotPanel &&
            spotPanel.draft.lat != null &&
            spotPanel.draft.lng != null
              ? {
                  lng: spotPanel.draft.lng,
                  lat: spotPanel.draft.lat,
                  category: pinCategory(spotPanel.draft.baseCategory),
                }
              : null
          }
          onPlace={(lng, lat) => {
            void place(lng, lat)
          }}
          onDraftMove={(lng, lat) => {
            void place(lng, lat)
          }}
        />
      </div>
      {spotPanel ? (
        <SpotPanel
          mode="add"
          draft={spotPanel.draft}
          tripId={tripId}
          lang={lang}
          saving={spotSaving}
          linkError={linkError}
          formError={spotError}
          spot={null}
          spots={spots}
          plans={[]}
          entries={entries}
          onDraft={changeSpotDraft}
          onClose={() => {
            if (!spotPanel) return
            if (!draftsEqual(spotPanel.draft, spotPanel.baseline)) {
              if (!window.confirm(t('board.discard'))) return
            }
            setSpotPanel(null)
          }}
          onSubmit={() => {
            void saveSpot()
          }}
          onDelete={() => undefined}
          onAddToPlan={async () => undefined}
          onRemoveFromPlan={async () => undefined}
        />
      ) : null}
      {dialog ? (
        <EntryDialog
          mode={dialog.mode}
          type={dialog.mode === 'create' ? dialog.type : dialog.entry.type}
          initial={
            dialog.mode === 'create'
              ? emptyDraft(dialog.type)
              : draftFromEntry(dialog.entry)
          }
          visits={dialog.mode === 'edit' ? dialog.entry.spots : []}
          saving={saving}
          onClose={() => setDialog(null)}
          onSave={(draft) => {
            void save(draft)
          }}
          onDelete={
            dialog.mode === 'edit'
              ? () => {
                  void removeEntry()
                }
              : undefined
          }
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
    </main>
  )
}

function blank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function emptyDraft(type: PlanEntryType): PlanDraft {
  return {
    type,
    title: '',
    startDate: '',
    endDate: null,
    startTime: null,
    endTime: null,
    info: null,
  }
}

function draftFromEntry(entry: PlanEntry): PlanDraft {
  return {
    type: entry.type,
    title: entry.title,
    startDate: entry.startDate,
    endDate: entry.endDate,
    startTime: entry.startTime,
    endTime: entry.endTime,
    info: entry.info,
  }
}

function writeBody(draft: PlanDraft): PlanWrite {
  const normalized = normalizePlanDraft(draft)
  return {
    type: normalized.type,
    title: normalized.title,
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    startTime: normalized.startTime,
    endTime: normalized.endTime,
    info: normalized.info,
    ...(normalized.type === 'single' ? { date: normalized.startDate } : {}),
  }
}

function reorderLocally(entry: PlanEntry, linkIds: string[]): PlanEntry {
  const byId = new Map(entry.spots.map((link) => [link.id, link]))
  const spots = linkIds.flatMap((linkId, index) => {
    const link = byId.get(linkId)
    return link ? [{ ...link, sortOrder: index }] : []
  })
  return { ...entry, spots }
}
