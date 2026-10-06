import type { PlanEntry, PlanLink, Spot } from '@tripboard/shared'
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  Pencil,
  X,
} from 'lucide-react'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { activeLocale } from '../i18n'
import { formatDate } from '../lib/format'
import type { AppLocale } from '../lib/locale'
import { cn } from '../lib/utils'
import { scheduleHome } from './home'
import { VisitDatePicker } from './VisitDatePicker'

const inputClass =
  'w-full min-h-11 rounded-[8px] border border-border bg-card px-3 text-foreground'

export function ScheduleList({
  entries,
  spots,
  canEdit,
  selectedId,
  onSelect,
  onEdit,
  onAddSpot,
  onRemoveSpot,
  onReorder,
  onCreateSpot,
  createdSpot,
}: {
  entries: PlanEntry[]
  spots: Spot[]
  canEdit: boolean
  selectedId: string | null
  onSelect: (entryId: string) => void
  onEdit: (entry: PlanEntry) => void
  onAddSpot: (
    entryId: string,
    body: {
      spotId: string
      visitDate: string | null
      visitTime: string | null
      info: string | null
    },
  ) => Promise<void>
  onRemoveSpot: (entryId: string, linkId: string) => Promise<void>
  onReorder: (entryId: string, linkIds: string[]) => Promise<void>
  onCreateSpot: (entryId: string, query: string) => void
  createdSpot: { entryId: string; spotId: string } | null
}) {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const dragRef = useRef<string | null>(null)

  return (
    <ul data-testid="schedule-list" className="m-0 list-none p-0">
      {entries.map((entry) => {
        const open = entry.type === 'single' || !closed[entry.id]
        const range = entryRange(entry, locale, t)
        const home = scheduleHome(entry, spots)
        return (
          <li
            key={entry.id}
            data-testid={`entry-row-${entry.id}`}
            className={cn(
              'border-b border-border',
              selectedId === entry.id && 'bg-background',
            )}
          >
            <div className="flex items-start gap-1 px-2 py-2">
              {entry.type === 'bucket' ? (
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px]"
                  aria-expanded={open}
                  aria-label={t(
                    open ? 'schedule.collapse' : 'schedule.expand',
                    {
                      title: entry.title,
                    },
                  )}
                  onClick={() =>
                    setClosed((current) => ({
                      ...current,
                      [entry.id]: open,
                    }))
                  }
                >
                  {open ? (
                    <ChevronDown aria-hidden="true" className="size-4" />
                  ) : (
                    <ChevronRight aria-hidden="true" className="size-4" />
                  )}
                </button>
              ) : (
                <span
                  aria-hidden="true"
                  className="inline-flex size-11 shrink-0 items-center justify-center"
                >
                  <span className="size-2 rounded-full bg-foreground" />
                </span>
              )}
              <button
                type="button"
                data-testid={`entry-${entry.id}`}
                className="min-h-11 min-w-0 flex-1 rounded-[8px] px-2 py-1 text-left"
                onClick={() => onSelect(entry.id)}
              >
                <span className="block font-semibold">
                  {entry.title}
                  {home ? (
                    <span className="ml-2 font-normal text-muted">
                      {t('schedule.home', { title: home.title })}
                    </span>
                  ) : null}
                </span>
                <span className="block text-sm text-muted">{range}</span>
                {entry.info ? (
                  <span className="mt-1 block text-sm">{entry.info}</span>
                ) : null}
                {entry.outsideTripDates ? (
                  <span className="mt-1 block text-sm text-muted">
                    {t('schedule.outsideTrip')}
                  </span>
                ) : null}
              </button>
              {canEdit ? (
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px]"
                  aria-label={t('schedule.editEntry', { title: entry.title })}
                  onClick={() => onEdit(entry)}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </div>
            {open && entry.type === 'bucket' ? (
              <BucketSpots
                entry={entry}
                spots={spots}
                canEdit={canEdit}
                locale={locale}
                dragRef={dragRef}
                onAddSpot={onAddSpot}
                onRemoveSpot={onRemoveSpot}
                onReorder={onReorder}
                onCreateSpot={onCreateSpot}
                createdSpotId={
                  createdSpot?.entryId === entry.id ? createdSpot.spotId : null
                }
              />
            ) : null}
            {open && entry.type === 'single' ? (
              <div className="pb-3 pl-14 pr-3">
                {entry.spots.length > 0 ? (
                  <ul className="m-0 list-none pb-2">
                    {entry.spots.map((link) => (
                      <li key={link.id} className="py-1 text-sm">
                        <VisitLabel link={link} locale={locale} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canEdit ? (
                  <SpotAdder
                    entry={entry}
                    spots={spots}
                    createdSpotId={
                      createdSpot?.entryId === entry.id
                        ? createdSpot.spotId
                        : null
                    }
                    onAdd={onAddSpot}
                    onCreate={onCreateSpot}
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function BucketSpots({
  entry,
  spots,
  canEdit,
  locale,
  dragRef,
  onAddSpot,
  onRemoveSpot,
  onReorder,
  onCreateSpot,
  createdSpotId,
}: {
  entry: PlanEntry
  spots: Spot[]
  canEdit: boolean
  locale: AppLocale
  dragRef: { current: string | null }
  onAddSpot: (
    entryId: string,
    body: {
      spotId: string
      visitDate: string | null
      visitTime: string | null
      info: string | null
    },
  ) => Promise<void>
  onRemoveSpot: (entryId: string, linkId: string) => Promise<void>
  onReorder: (entryId: string, linkIds: string[]) => Promise<void>
  onCreateSpot: (entryId: string, query: string) => void
  createdSpotId: string | null
}) {
  const { t } = useTranslation()
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLLIElement>())
  const beforeTops = useRef<Map<string, number> | null>(null)
  const focusTarget = useRef<{ id: string; which: 'up' | 'down' } | null>(null)
  const order = entry.spots.map((link) => link.id).join('\n')

  useLayoutEffect(() => {
    const before = beforeTops.current
    beforeTops.current = null
    if (before) flipRows(before, rowRefs.current)
    const pending = focusTarget.current
    focusTarget.current = null
    if (!pending) return
    document
      .querySelector<HTMLButtonElement>(
        `[data-testid="move-${pending.which}-${pending.id}"]`,
      )
      ?.focus()
  }, [order])

  useLayoutEffect(() => {
    if (!highlightId) return
    const timer = window.setTimeout(() => setHighlightId(null), 1000)
    return () => window.clearTimeout(timer)
  }, [highlightId])

  function rememberRows() {
    const next = new Map<string, number>()
    for (const [id, element] of rowRefs.current) {
      next.set(id, element.getBoundingClientRect().top)
    }
    beforeTops.current = next
  }

  function move(index: number, delta: number) {
    const links = entry.spots
    const link = links[index]
    const target = index + delta
    if (!link || target < 0 || target >= links.length) return
    const ids = links.map((item) => item.id)
    ids.splice(index, 1)
    ids.splice(target, 0, link.id)
    rememberRows()
    focusTarget.current = { id: link.id, which: delta < 0 ? 'up' : 'down' }
    setHighlightId(link.id)
    setAnnouncement(
      t('schedule.moved', {
        spot: link.title,
        position: target + 1,
        total: ids.length,
      }),
    )
    void onReorder(entry.id, ids)
  }

  function drop(targetId: string) {
    const sourceId = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    setOverId(null)
    if (!sourceId || sourceId === targetId) return
    const links = entry.spots
    const ids = links.map((link) => link.id)
    const from = ids.indexOf(sourceId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    const moved = links[from]
    ids.splice(from, 1)
    ids.splice(to, 0, sourceId)
    rememberRows()
    if (moved) {
      setHighlightId(moved.id)
      setAnnouncement(
        t('schedule.moved', {
          spot: moved.title,
          position: to + 1,
          total: ids.length,
        }),
      )
    }
    void onReorder(entry.id, ids)
  }

  return (
    <div className="pb-3 pl-4 pr-3">
      <p className="sr-only" aria-live="polite" data-testid="reorder-live">
        {announcement}
      </p>
      <ul className="m-0 list-none p-0">
        {entry.spots.map((link, index) => {
          const upLabel = t('schedule.moveUp', { spot: link.title })
          const downLabel = t('schedule.moveDown', { spot: link.title })
          const removeLabel = t('schedule.removeVisit', {
            spot: link.title,
            entry: entry.title,
          })
          return (
            <li
              key={link.id}
              ref={(node) => {
                if (node) rowRefs.current.set(link.id, node)
                else rowRefs.current.delete(link.id)
              }}
              data-testid={`visit-${link.id}`}
              data-highlighted={highlightId === link.id ? 'true' : 'false'}
              className={cn(
                'border-t border-border py-1',
                highlightId === link.id && 'bg-accent/15',
                draggingId === link.id && 'opacity-40',
              )}
              onDragOver={(event) => {
                if (!canEdit) return
                event.preventDefault()
                setOverId(link.id)
              }}
              onDrop={() => {
                if (canEdit) drop(link.id)
              }}
            >
              {overId === link.id && draggingId && draggingId !== link.id ? (
                <div
                  data-testid="drop-indicator"
                  className="mb-1 h-0.5 bg-foreground"
                  aria-hidden="true"
                />
              ) : null}
              <div className="flex items-center gap-1">
                {canEdit ? (
                  <button
                    type="button"
                    draggable
                    data-testid={`drag-${link.id}`}
                    aria-label={t('schedule.drag', { spot: link.title })}
                    className="inline-flex size-11 shrink-0 cursor-grab items-center justify-center rounded-[8px]"
                    onDragStart={(event) => {
                      setDraggingId(link.id)
                      startDrag(event, link.id, dragRef)
                    }}
                    onDragEnd={() => {
                      dragRef.current = null
                      setDraggingId(null)
                      setOverId(null)
                    }}
                  >
                    <GripVertical aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
                <div className="min-w-0 flex-1">
                  <span
                    data-testid={`visit-title-${link.id}`}
                    className="block font-medium"
                  >
                    {link.title}
                  </span>
                  <span className="block text-sm text-muted">
                    <VisitLabel link={link} locale={locale} />
                  </span>
                  {link.info ? (
                    <span className="block text-sm">{link.info}</span>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex shrink-0">
                    <button
                      type="button"
                      data-testid={`move-up-${link.id}`}
                      aria-label={upLabel}
                      title={upLabel}
                      disabled={index === 0}
                      className="inline-flex size-11 items-center justify-center rounded-[8px] disabled:opacity-40"
                      onClick={() => move(index, -1)}
                    >
                      <ChevronUp aria-hidden="true" className="size-4" />
                    </button>
                    <button
                      type="button"
                      data-testid={`move-down-${link.id}`}
                      aria-label={downLabel}
                      title={downLabel}
                      disabled={index === entry.spots.length - 1}
                      className="inline-flex size-11 items-center justify-center rounded-[8px] disabled:opacity-40"
                      onClick={() => move(index, 1)}
                    >
                      <ChevronDown aria-hidden="true" className="size-4" />
                    </button>
                    <button
                      type="button"
                      data-testid={`remove-visit-${link.id}`}
                      aria-label={removeLabel}
                      title={removeLabel}
                      className="inline-flex size-11 items-center justify-center rounded-[8px]"
                      onClick={() => {
                        void onRemoveSpot(entry.id, link.id)
                      }}
                    >
                      <X aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      {canEdit ? (
        <SpotAdder
          entry={entry}
          spots={spots}
          createdSpotId={createdSpotId}
          onAdd={onAddSpot}
          onCreate={onCreateSpot}
        />
      ) : null}
    </div>
  )
}

function SpotAdder({
  entry,
  spots,
  createdSpotId,
  onAdd,
  onCreate,
}: {
  entry: PlanEntry
  spots: Spot[]
  createdSpotId: string | null
  onAdd: (
    entryId: string,
    body: {
      spotId: string
      visitDate: string | null
      visitTime: string | null
      info: string | null
    },
  ) => Promise<void>
  onCreate: (entryId: string, query: string) => void
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  if (!adding) {
    return (
      <Button
        variant="outline"
        className="mt-2"
        data-testid={`add-spot-${entry.id}`}
        onClick={() => setAdding(true)}
      >
        {t('schedule.addSpot')}
      </Button>
    )
  }
  return (
    <AddSpotForm
      entry={entry}
      spots={spots}
      createdSpotId={createdSpotId}
      onCreate={(query) => onCreate(entry.id, query)}
      onCancel={() => setAdding(false)}
      onAdd={async (body) => {
        await onAdd(entry.id, body)
        setAdding(false)
      }}
    />
  )
}

function AddSpotForm({
  entry,
  spots,
  createdSpotId,
  onCancel,
  onAdd,
  onCreate,
}: {
  entry: PlanEntry
  spots: Spot[]
  createdSpotId: string | null
  onCancel: () => void
  onAdd: (body: {
    spotId: string
    visitDate: string | null
    visitTime: string | null
    info: string | null
  }) => Promise<void>
  onCreate: (query: string) => void
}) {
  const { t } = useTranslation()
  const searchId = useId()
  const timeId = useId()
  const infoId = useId()
  const [query, setQuery] = useState('')
  const [spotId, setSpotId] = useState<string | null>(createdSpotId)
  const [visitDate, setVisitDate] = useState<string | null>(null)
  const [visitTime, setVisitTime] = useState('')
  const [info, setInfo] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (createdSpotId) setSpotId(createdSpotId)
  }, [createdSpotId])

  const trimmed = query.trim().toLowerCase()
  const matches = spots.filter((spot) =>
    trimmed.length === 0
      ? true
      : spot.title.toLowerCase().includes(trimmed) ||
        (spot.address ?? '').toLowerCase().includes(trimmed),
  )
  const chosen = spots.find((spot) => spot.id === spotId) ?? null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!spotId || saving) return
    setSaving(true)
    setFailed(false)
    try {
      await onAdd({
        spotId,
        visitDate,
        visitTime: visitTime.trim() === '' ? null : visitTime,
        info: info.trim() === '' ? null : info.trim(),
      })
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  return (
    <form className="mt-2 space-y-2" onSubmit={(event) => void submit(event)}>
      <label htmlFor={searchId} className="block text-sm font-semibold">
        {t('schedule.searchSpots')}
      </label>
      <input
        id={searchId}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className={inputClass}
      />
      <div
        role="listbox"
        aria-label={t('schedule.matchingSpots')}
        className="max-h-48 overflow-auto"
      >
        {matches.map((spot) => (
          <button
            key={spot.id}
            type="button"
            role="option"
            aria-selected={spot.id === spotId}
            className={cn(
              'min-h-11 w-full rounded-[8px] px-3 text-left',
              spot.id === spotId && 'bg-background',
            )}
            onClick={() => setSpotId(spot.id)}
          >
            {spot.title}
          </button>
        ))}
        <button
          type="button"
          role="option"
          aria-selected={false}
          data-testid="create-spot"
          className="min-h-11 w-full rounded-[8px] px-3 text-left"
          onClick={() => onCreate(query)}
        >
          {t('schedule.createSpot', { title: query.trim() })}
        </button>
      </div>
      {spots.length === 0 ? (
        <p className="text-sm text-muted">{t('schedule.noSpots')}</p>
      ) : null}
      {chosen ? (
        <>
          <VisitDatePicker
            start={entry.startDate}
            end={entry.endDate}
            value={visitDate}
            onChange={setVisitDate}
            label={t('schedule.visitDate')}
          />
          <label htmlFor={timeId} className="block text-sm font-semibold">
            {t('schedule.visitTime')}
          </label>
          <input
            id={timeId}
            type="time"
            step={60}
            value={visitTime}
            onChange={(event) => setVisitTime(event.target.value)}
            className={inputClass}
          />
          <label htmlFor={infoId} className="block text-sm font-semibold">
            {t('schedule.visitInfo')}
          </label>
          <textarea
            id={infoId}
            rows={2}
            value={info}
            onChange={(event) => setInfo(event.target.value)}
            className={inputClass}
          />
        </>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {t('schedule.saveError')}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t('schedule.cancel')}
        </Button>
        <Button type="submit" disabled={!spotId || saving}>
          {t('schedule.addVisit')}
        </Button>
      </div>
    </form>
  )
}

function VisitLabel({ link, locale }: { link: PlanLink; locale: AppLocale }) {
  const { t } = useTranslation()
  if (!link.visitDate) return t('schedule.noVisitDate')
  const date = formatDate(link.visitDate, locale)
  if (!link.visitTime) return date
  return t('schedule.dateTime', { date, time: link.visitTime })
}

function entryRange(
  entry: PlanEntry,
  locale: AppLocale,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  const start = formatDate(entry.startDate, locale)
  if (entry.type === 'single') {
    return entry.startTime
      ? t('schedule.dateTime', { date: start, time: entry.startTime })
      : start
  }
  const end = formatDate(entry.endDate ?? entry.startDate, locale)
  const range = t('schedule.dateRange', { start, end })
  if (!entry.startTime) return range
  return t('schedule.dateTime', { date: range, time: entry.startTime })
}

function flipRows(before: Map<string, number>, rows: Map<string, HTMLElement>) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  for (const [id, element] of rows) {
    const previous = before.get(id)
    if (previous == null) continue
    const delta = previous - element.getBoundingClientRect().top
    if (Math.abs(delta) < 1) continue
    element.animate(
      [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
      { duration: 180, easing: 'ease-out' },
    )
  }
}

function startDrag(
  event: DragEvent<HTMLButtonElement>,
  linkId: string,
  dragRef: { current: string | null },
) {
  dragRef.current = linkId
  if (!event.dataTransfer) return
  event.dataTransfer.setData('text/plain', linkId)
  event.dataTransfer.effectAllowed = 'move'
}
