import type { PlanEntry, PlanLink, Spot } from '@tripboard/shared'
import { ChevronDown, ChevronRight, GripVertical, Pencil } from 'lucide-react'
import { useId, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { activeLocale } from '../i18n'
import { formatDate } from '../lib/format'
import type { AppLocale } from '../lib/locale'
import { cn } from '../lib/utils'
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
                <span className="block font-semibold">{entry.title}</span>
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
              />
            ) : null}
            {open && entry.type === 'single' && entry.spots.length > 0 ? (
              <ul className="m-0 list-none pb-2 pl-14 pr-3">
                {entry.spots.map((link) => (
                  <li key={link.id} className="py-1 text-sm">
                    <VisitLabel link={link} locale={locale} />
                  </li>
                ))}
              </ul>
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
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)

  function move(index: number, delta: number) {
    const ids = entry.spots.map((link) => link.id)
    const target = index + delta
    const id = ids[index]
    if (!id || target < 0 || target >= ids.length) return
    ids.splice(index, 1)
    ids.splice(target, 0, id)
    void onReorder(entry.id, ids)
  }

  function drop(targetId: string) {
    const sourceId = dragRef.current
    dragRef.current = null
    if (!sourceId || sourceId === targetId) return
    const ids = entry.spots.map((link) => link.id)
    const from = ids.indexOf(sourceId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1)
    ids.splice(to, 0, sourceId)
    void onReorder(entry.id, ids)
  }

  return (
    <div className="pb-3 pl-4 pr-3">
      <ul className="m-0 list-none p-0">
        {entry.spots.map((link, index) => (
          <li
            key={link.id}
            data-testid={`visit-${link.id}`}
            className="flex items-center gap-1 border-t border-border py-1"
            onDragOver={(event) => {
              if (!canEdit) return
              event.preventDefault()
            }}
            onDrop={() => {
              if (canEdit) drop(link.id)
            }}
          >
            {canEdit ? (
              <button
                type="button"
                draggable
                data-testid={`drag-${link.id}`}
                aria-label={t('schedule.drag', { spot: link.title })}
                className="inline-flex size-11 shrink-0 cursor-grab items-center justify-center rounded-[8px]"
                onDragStart={(event) => startDrag(event, link.id, dragRef)}
                onDragEnd={() => {
                  dragRef.current = null
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
                {index > 0 ? (
                  <button
                    type="button"
                    data-testid={`move-up-${link.id}`}
                    aria-label={t('schedule.moveUp', { spot: link.title })}
                    className="inline-flex size-11 items-center justify-center rounded-[8px]"
                    onClick={() => move(index, -1)}
                  >
                    {t('schedule.up')}
                  </button>
                ) : null}
                {index < entry.spots.length - 1 ? (
                  <button
                    type="button"
                    data-testid={`move-down-${link.id}`}
                    aria-label={t('schedule.moveDown', { spot: link.title })}
                    className="inline-flex size-11 items-center justify-center rounded-[8px]"
                    onClick={() => move(index, 1)}
                  >
                    {t('schedule.down')}
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid={`remove-visit-${link.id}`}
                  aria-label={t('schedule.removeVisit', {
                    spot: link.title,
                    entry: entry.title,
                  })}
                  className="inline-flex size-11 items-center justify-center rounded-[8px]"
                  onClick={() => {
                    void onRemoveSpot(entry.id, link.id)
                  }}
                >
                  {t('schedule.remove')}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        adding ? (
          <AddSpotForm
            entry={entry}
            spots={spots}
            onCancel={() => setAdding(false)}
            onAdd={async (body) => {
              await onAddSpot(entry.id, body)
              setAdding(false)
            }}
          />
        ) : (
          <Button
            variant="outline"
            className="mt-2"
            data-testid={`add-spot-${entry.id}`}
            onClick={() => setAdding(true)}
          >
            {t('schedule.addSpot')}
          </Button>
        )
      ) : null}
    </div>
  )
}

function AddSpotForm({
  entry,
  spots,
  onCancel,
  onAdd,
}: {
  entry: PlanEntry
  spots: Spot[]
  onCancel: () => void
  onAdd: (body: {
    spotId: string
    visitDate: string | null
    visitTime: string | null
    info: string | null
  }) => Promise<void>
}) {
  const { t } = useTranslation()
  const searchId = useId()
  const timeId = useId()
  const infoId = useId()
  const [query, setQuery] = useState('')
  const [spotId, setSpotId] = useState<string | null>(null)
  const [visitDate, setVisitDate] = useState<string | null>(null)
  const [visitTime, setVisitTime] = useState('')
  const [info, setInfo] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
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

function startDrag(
  event: DragEvent<HTMLButtonElement>,
  linkId: string,
  dragRef: { current: string | null },
) {
  dragRef.current = linkId
  event.dataTransfer.setData('text/plain', linkId)
  event.dataTransfer.effectAllowed = 'move'
}
