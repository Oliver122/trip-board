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
import { Toast, type ToastMessage } from '../components/Toast'
import { Button } from '../components/ui/button'
import { EmptyState, ErrorState } from '../components/states'
import { activeLocale } from '../i18n'
import { boundsForPoints } from '../map/bounds'
import type { MapSpot } from '../map/clusters'
import { ConflictDialog, type ConflictRow } from '../live/ConflictDialog'
import { EntryDialog } from '../plan/EntryDialog'
import {
  addPlanSpot,
  ConflictError as PlanConflictError,
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
import { AuthError } from '../trips/client'
import { useMapScene, useTripData, type MapScene } from '../trips/trip-context'

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
  const {
    trip,
    spots,
    entries,
    setEntries,
    selectedEntryId,
    setSelectedEntryId,
    replaceSpots,
    updateSpots,
    notices,
    dismissNotice,
    liveError,
  } = useTripData()
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [conflict, setConflict] = useState<{
    current: PlanEntry
    updatedByName: string
    body: PlanWrite
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToastState] = useState<ToastMessage | null>(null)
  const setToast = (message: string, kind: ToastMessage['kind'] = 'error') => {
    setToastState(message ? { message, kind } : null)
  }
  const [attempt, setAttempt] = useState(0)
  const [planError, setPlanError] = useState(false)
  const [spotPanel, setSpotPanel] = useState<SpotPanelState | null>(null)
  const [spotSaving, setSpotSaving] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [spotError, setSpotError] = useState<string | null>(null)
  const [createdSpot, setCreatedSpot] = useState<{
    entryId: string
    spotId: string
  } | null>(null)
  const creatingFor = useRef<string | null>(null)
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const lang = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const tripId = id ?? trip.id
  const canEdit = trip.role !== 'visitor'

  const seenLiveError = useRef(0)
  useEffect(() => {
    if (liveError === seenLiveError.current) return
    seenLiveError.current = liveError
    setToast(t('board.loadError'))
  }, [liveError, t])

  useEffect(() => {
    if (notices.length === 0) return
    for (const notice of notices) {
      if (
        notice.action.endsWith('.delete') &&
        notice.resource === 'plan' &&
        dialog?.mode === 'edit' &&
        dialog.entry.id === notice.id
      ) {
        setDialog(null)
        setToast(
          t('live.deleted', { name: notice.actorName || t('live.someone') }),
          'info',
        )
      }
      dismissNotice(notice.token)
    }
  }, [dialog, dismissNotice, notices, t])

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    setPlanError(false)
    void listPlan(id, controller.signal)
      .then((plan) => {
        setEntries(plan)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof AuthError) {
          reload()
          return
        }
        if (!entriesRef.current) setPlanError(true)
        else setToast(t('schedule.saveError'))
      })
    return () => controller.abort()
  }, [attempt, id, reload, setEntries, t])

  const focus = useMemo(() => {
    const entry = (entries ?? []).find((item) => item.id === selectedEntryId)
    if (!entry) return null
    const points = entry.spots.flatMap((link) => {
      const spot = spots.find((item) => item.id === link.spotId)
      return spot ? [{ lat: spot.lat, lng: spot.lng }] : []
    })
    const bounds = boundsForPoints(points)
    if (!bounds) return null
    return { key: entry.id, bounds }
  }, [entries, selectedEntryId, spots])

  const highlightIds = useMemo(() => {
    const entry = (entries ?? []).find((item) => item.id === selectedEntryId)
    return entry ? entry.spots.map((link) => link.spotId) : []
  }, [entries, selectedEntryId])

  const mapSpots = useMemo(() => toMapSpots(spots), [spots])
  const draftPin = useMemo(() => {
    if (
      !spotPanel ||
      spotPanel.draft.lat == null ||
      spotPanel.draft.lng == null
    ) {
      return null
    }
    return {
      lng: spotPanel.draft.lng,
      lat: spotPanel.draft.lat,
      category: pinCategory(spotPanel.draft.baseCategory),
    }
  }, [spotPanel])
  const placing = spotPanel != null
  const scene = useMemo<MapScene>(
    () => ({
      spots: mapSpots,
      selectedId: null,
      hoverId: null,
      placing,
      draft: draftPin,
      highlightIds,
      focus,
      flyTo: null,
    }),
    [draftPin, focus, highlightIds, mapSpots, placing],
  )

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

  useMapScene(scene, {
    onSelect: () => undefined,
    onHover: () => undefined,
    onPlace: placing
      ? (lng, lat) => {
          void place(lng, lat)
        }
      : undefined,
    onDraftMove: placing
      ? (lng, lat) => {
          void place(lng, lat)
        }
      : undefined,
  })

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
      updateSpots((current) => [...current, saved])
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

  async function refresh() {
    const [plan, spotList] = await Promise.all([
      listPlan(tripId),
      listSpots(tripId, defaultSpotListQuery),
    ])
    setEntries(plan)
    replaceSpots(spotList.spots, spotList.total)
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
    const body = writeBody(draft)
    try {
      if (dialog.mode === 'create') await createPlanEntry(tripId, body)
      else await updatePlanEntry(dialog.entry.id, body, dialog.entry.updatedAt)
      await refresh()
      setDialog(null)
      setConflict(null)
    } catch (error) {
      if (error instanceof PlanConflictError && dialog.mode === 'edit') {
        setConflict({
          current: error.current,
          updatedByName: error.updatedBy?.name ?? '',
          body,
        })
        return
      }
      fail(error)
    } finally {
      setSaving(false)
    }
  }

  async function useMine() {
    if (!conflict || dialog?.mode !== 'edit') return
    setSaving(true)
    try {
      await updatePlanEntry(dialog.entry.id, conflict.body)
      await refresh()
      setConflict(null)
      setDialog(null)
    } catch (error) {
      fail(error)
    } finally {
      setSaving(false)
    }
  }

  function useTheirs() {
    if (!conflict) return
    setDialog({ mode: 'edit', entry: conflict.current })
    setFormKey((value) => value + 1)
    setConflict(null)
  }

  async function removeEntry() {
    if (dialog?.mode !== 'edit') return
    setSaving(true)
    try {
      await deletePlanEntry(dialog.entry.id)
      if (selectedEntryId === dialog.entry.id) setSelectedEntryId(null)
      await refresh()
      setDialog(null)
    } catch (error) {
      fail(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-auto border-b border-border lg:border-r lg:border-b-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h1 className="mr-auto text-xl font-semibold">{t('schedule.title')}</h1>
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
      {planError && !entries ? (
        <div className="p-4">
          <ErrorState retry={() => setAttempt((value) => value + 1)} />
        </div>
      ) : !entries ? (
        <PanelSkeleton />
      ) : entries.length === 0 ? (
        <div className="p-4">
          <EmptyState title={t('schedule.empty')} />
        </div>
      ) : (
        <ScheduleList
          entries={entries}
          spots={spots}
          canEdit={canEdit}
          selectedId={selectedEntryId}
          onSelect={setSelectedEntryId}
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
            setEntries(
              entries.map((entry) =>
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
          entries={entries ?? []}
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
          key={formKey}
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
      {conflict ? (
        <ConflictDialog
          name={conflict.updatedByName}
          titleKey="live.conflictSaved"
          rows={planConflictRows(t, conflict.body, conflict.current)}
          onMine={() => {
            void useMine()
          }}
          onTheirs={useTheirs}
        />
      ) : null}
      {toast ? <Toast toast={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}

function PanelSkeleton() {
  return (
    <div
      data-testid="panel-skeleton"
      className="flex flex-col gap-3 p-4"
      aria-hidden="true"
    >
      <div className="h-8 rounded bg-border" />
      <div className="h-24 rounded bg-border" />
    </div>
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
  }))
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

function planConflictRows(
  t: (key: string) => string,
  mine: PlanWrite,
  theirs: PlanEntry,
): ConflictRow[] {
  const pairs: Array<[string, string, string]> = [
    [t('schedule.fieldTitle'), mine.title, theirs.title],
    [t('schedule.startDate'), mine.startDate, theirs.startDate],
    [t('schedule.endDate'), mine.endDate ?? '', theirs.endDate ?? ''],
    [t('schedule.startTime'), mine.startTime ?? '', theirs.startTime ?? ''],
    [t('schedule.endTime'), mine.endTime ?? '', theirs.endTime ?? ''],
    [t('schedule.info'), mine.info ?? '', theirs.info ?? ''],
  ]
  return pairs
    .filter(([, left, right]) => left !== right)
    .map(([label, left, right]) => ({ label, mine: left, theirs: right }))
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
