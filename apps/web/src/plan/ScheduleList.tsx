import {
  planDays,
  type PlanDays,
  type PlanEntry,
  type PlanLink,
  type Spot,
} from '@tripboard/shared'
import { phoneQuery, useMediaQuery } from '../lib/media'
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Pencil,
} from 'lucide-react'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorNotice } from '../components/notice'
import { Button } from '../components/ui/button'
import { Menu, MenuItem } from '../components/ui/menu'
import { hoverClass } from '../components/ui/hover'
import { activeLocale } from '../i18n'
import { formatDate } from '../lib/format'
import type { AppLocale } from '../lib/locale'
import { cn } from '../lib/utils'
import {
  dayGroups,
  mergeGroupOrder,
  moveLink,
  untimedIds,
  type DayGroup,
  type DayRow,
} from './day-groups'
import { dayColorVar } from './day-colors'
import { scheduleHome } from './home'
import { MoveDialog } from './MoveDialog'
import { formatDayLabel } from './plan-scene'
import { RowStrip, RowSymbol } from './RowKind'
import { VisitDatePicker } from './VisitDatePicker'

const inputClass =
  'w-full min-h-11 rounded-[8px] border border-border bg-card px-3 text-foreground'

type DragSource = { linkId: string; entryId: string }

type DropProps = {
  'data-drop-target': 'true' | 'false'
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: () => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

export function ScheduleList({
  entries,
  spots,
  canEdit,
  selectedId,
  tripStart = null,
  focusedDate = null,
  selectedLinkId = null,
  onSelect,
  onFocusDay,
  onEdit,
  onAddSpot,
  onRemoveSpot,
  onReorder,
  onMoveSpot,
  onCreateSpot,
  createdSpot,
}: {
  entries: PlanEntry[]
  spots: Spot[]
  canEdit: boolean
  selectedId: string | null
  /** The trip's start date, so a day has the same colour as on the map. */
  tripStart?: string | null
  focusedDate?: string | null
  selectedLinkId?: string | null
  onSelect: (entryId: string) => void
  /** A day header was clicked: the page toggles the focus (R-46-07). */
  onFocusDay?: (date: string | null) => void
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
  onMoveSpot?: (
    fromEntryId: string,
    linkId: string,
    toEntryId: string,
    visitDate: string | null,
  ) => Promise<void>
  onCreateSpot: (entryId: string, query: string) => void
  createdSpot: { entryId: string; spotId: string } | null
}) {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [announcement, setAnnouncement] = useState('')
  const [dropKey, setDropKey] = useState<string | null>(null)
  const [moving, setMoving] = useState<{
    entryId: string
    link: PlanLink
  } | null>(null)
  const dragRef = useRef<DragSource | null>(null)
  const focusLink = useRef<string | null>(null)
  // One plan over all entries, so a date has one colour and one numbering.
  const planned = useMemo(
    () => planDays(entries, { tripStart }),
    [entries, tripStart],
  )

  // R-46-04: focus returns to the moved row's ⋯ button once it is rendered.
  useLayoutEffect(() => {
    const id = focusLink.current
    if (!id) return
    const button = document.querySelector<HTMLButtonElement>(
      `[data-testid="row-menu-${id}"]`,
    )
    if (!button) return
    focusLink.current = null
    button.focus()
  }, [entries])

  // R-46-07: a focused day scrolls into view in the list.
  useEffect(() => {
    if (!focusedDate) return
    const group = document.querySelector<HTMLElement>(
      `[data-testid^="day-group-"][data-date="${focusedDate}"]`,
    )
    scrollTo(group)
  }, [focusedDate])

  // R-46-05: a pin click selects its row, opening its bucket if needed.
  useEffect(() => {
    if (!selectedLinkId) return
    const owner = entries.find((entry) =>
      entry.spots.some((link) => link.id === selectedLinkId),
    )
    if (owner && closed[owner.id]) {
      setClosed((current) => ({ ...current, [owner.id]: false }))
      return
    }
    scrollTo(
      document.querySelector<HTMLElement>(
        `[data-testid="visit-${selectedLinkId}"]`,
      ),
    )
  }, [selectedLinkId, closed])

  function moveTo(
    fromEntryId: string,
    linkId: string,
    toEntryId: string,
    visitDate: string | null,
  ) {
    if (!onMoveSpot) return
    const next = moveLink(entries, fromEntryId, linkId, toEntryId, visitDate)
    if (next === entries) return
    const target = entries.find((entry) => entry.id === toEntryId)
    if (visitDate) {
      const stop = planDays(next, { tripStart })
        .days.find((day) => day.date === visitDate)
        ?.stops.find((item) => item.linkId === linkId)
      setAnnouncement(
        t('schedule.movedTo', {
          day: formatDayLabel(visitDate, locale),
          stop: stop?.stopNumber ?? 1,
        }),
      )
    } else {
      setAnnouncement(
        t('schedule.movedToAnyDay', { entry: target?.title ?? '' }),
      )
    }
    focusLink.current = linkId
    setClosed((current) => ({ ...current, [toEntryId]: false }))
    void onMoveSpot(fromEntryId, linkId, toEntryId, visitDate)
  }

  /** Drop target attributes of a day header or *Any day* (R-46-04). */
  function dropProps(entryId: string, date: string | null): DropProps {
    const key = `${entryId}|${date ?? 'any'}`
    return {
      'data-drop-target': dropKey === key ? 'true' : 'false',
      onDragOver: (event) => {
        if (!canEdit || !onMoveSpot || !dragRef.current) return
        event.preventDefault()
        setDropKey(key)
      },
      onDragLeave: () =>
        setDropKey((current) => (current === key ? null : current)),
      onDrop: (event) => {
        event.preventDefault()
        const source = dragRef.current
        dragRef.current = null
        setDropKey(null)
        if (!canEdit || !source) return
        const from = entries.find((entry) => entry.id === source.entryId)
        const link = from?.spots.find((item) => item.id === source.linkId)
        if (!link) return
        if (source.entryId === entryId && link.visitDate === date) return
        moveTo(source.entryId, source.linkId, entryId, date)
      },
    }
  }

  const shared = {
    spots,
    canEdit,
    locale,
    planned,
    focusedDate,
    selectedLinkId,
    dragRef,
    dropProps,
    onFocusDay,
    onMoveDialog: (entryId: string, link: PlanLink) =>
      setMoving({ entryId, link }),
    canMove: onMoveSpot != null,
  }

  return (
    <>
      <p className="sr-only" aria-live="polite" data-testid="reorder-live">
        {announcement}
      </p>
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
              <div className="flex items-start gap-1 py-2 pl-4 pr-2">
                <button
                  type="button"
                  data-testid={`entry-${entry.id}`}
                  className={cn(
                    hoverClass.item,
                    'min-h-11 min-w-0 flex-1 rounded-[8px] py-1 text-left',
                  )}
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
                {entry.type === 'bucket' ? (
                  <button
                    type="button"
                    className={cn(
                      hoverClass.ghost,
                      'inline-flex size-11 shrink-0 items-center justify-center rounded-[8px]',
                    )}
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
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    className={cn(
                      hoverClass.ghost,
                      'inline-flex size-11 shrink-0 items-center justify-center rounded-[8px]',
                    )}
                    aria-label={t('schedule.editEntry', { title: entry.title })}
                    onClick={() => onEdit(entry)}
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
              </div>
              {open && entry.type === 'bucket' ? (
                <BucketSpots
                  {...shared}
                  entry={entry}
                  announce={setAnnouncement}
                  onAddSpot={onAddSpot}
                  onRemoveSpot={onRemoveSpot}
                  onReorder={onReorder}
                  onCreateSpot={onCreateSpot}
                  createdSpotId={
                    createdSpot?.entryId === entry.id
                      ? createdSpot.spotId
                      : null
                  }
                />
              ) : null}
              {open && entry.type === 'single' ? (
                <div className="pb-3 pl-4 pr-3">
                  {entry.spots.length > 0 ? (
                    <ul className="m-0 list-none pb-2">
                      {dayGroups(entry, planned)
                        .flatMap((group) =>
                          group.rows.map((row) => ({ group, row })),
                        )
                        .map(({ group, row }) => (
                          <VisitRow
                            key={row.link.id}
                            {...shared}
                            entryId={entry.id}
                            group={group}
                            row={row}
                          />
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
      {moving ? (
        <MoveDialog
          entries={entries}
          fromEntryId={moving.entryId}
          link={moving.link}
          locale={locale}
          onClose={() => setMoving(null)}
          onPick={(entryId, date) => {
            const { entryId: fromEntryId, link } = moving
            setMoving(null)
            moveTo(fromEntryId, link.id, entryId, date)
          }}
        />
      ) : null}
    </>
  )
}

type Shared = {
  spots: Spot[]
  canEdit: boolean
  locale: AppLocale
  planned: PlanDays
  focusedDate: string | null
  selectedLinkId: string | null
  dragRef: { current: DragSource | null }
  dropProps: (entryId: string, date: string | null) => DropProps
  onFocusDay?: (date: string | null) => void
  onMoveDialog: (entryId: string, link: PlanLink) => void
  canMove: boolean
}

function BucketSpots({
  entry,
  spots,
  canEdit,
  locale,
  planned,
  focusedDate,
  selectedLinkId,
  dragRef,
  dropProps,
  onFocusDay,
  onMoveDialog,
  canMove,
  announce,
  onAddSpot,
  onRemoveSpot,
  onReorder,
  onCreateSpot,
  createdSpotId,
}: Shared & {
  entry: PlanEntry
  announce: (message: string) => void
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
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLLIElement>())
  const beforeTops = useRef<Map<string, number> | null>(null)
  const focusTarget = useRef<string | null>(null)
  const order = entry.spots.map((link) => link.id).join('\n')
  const groups = dayGroups(entry, planned)

  useLayoutEffect(() => {
    const before = beforeTops.current
    beforeTops.current = null
    if (before) flipRows(before, rowRefs.current)
    const pending = focusTarget.current
    focusTarget.current = null
    if (!pending) return
    document
      .querySelector<HTMLButtonElement>(`[data-testid="row-menu-${pending}"]`)
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

  // R-46-02: only the untimed visits of a day reorder; the rest keep their place.
  function reorderGroup(
    group: DayGroup,
    ids: string[],
    moved: PlanLink,
    to: number,
  ) {
    rememberRows()
    setHighlightId(moved.id)
    announce(
      t('schedule.moved', {
        spot: moved.title,
        position: to + 1,
        total: ids.length,
      }),
    )
    void onReorder(entry.id, mergeGroupOrder(entry, untimedIds(group), ids))
  }

  function move(group: DayGroup, index: number, delta: number) {
    const untimed = untimedIds(group)
    const id = untimed[index]
    const target = index + delta
    const link = entry.spots.find((item) => item.id === id)
    if (!id || !link || target < 0 || target >= untimed.length) return
    const ids = [...untimed]
    ids.splice(index, 1)
    ids.splice(target, 0, id)
    focusTarget.current = id
    reorderGroup(group, ids, link, target)
  }

  function drop(group: DayGroup, targetId: string) {
    const source = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    setOverId(null)
    if (!source || source.linkId === targetId) return
    const untimed = untimedIds(group)
    const from = untimed.indexOf(source.linkId)
    const to = untimed.indexOf(targetId)
    if (source.entryId !== entry.id || from < 0 || to < 0) return
    const moved = entry.spots.find((link) => link.id === source.linkId)
    if (!moved) return
    const ids = [...untimed]
    ids.splice(from, 1)
    ids.splice(to, 0, source.linkId)
    reorderGroup(group, ids, moved, to)
  }

  return (
    <div className="pb-3 pl-4 pr-3">
      {groups.map((group) => {
        const key = group.date ?? 'any'
        const untimed = untimedIds(group)
        const drops = dropProps(entry.id, group.date)
        return (
          <section
            key={key}
            data-testid={`day-group-${entry.id}-${key}`}
            data-date={key}
          >
            {group.date ? (
              <h3 className="m-0">
                <button
                  type="button"
                  data-testid={`day-header-${entry.id}-${key}`}
                  aria-pressed={focusedDate === group.date}
                  title={t('schedule.focusDay', {
                    day: formatDayLabel(group.date, locale),
                  })}
                  className={cn(
                    hoverClass.item,
                    'flex min-h-11 w-full items-center gap-2 rounded-[8px] px-1 text-left font-semibold',
                    focusedDate === group.date && 'bg-hover',
                    drops['data-drop-target'] === 'true' &&
                      'outline-2 outline-offset-[-2px] outline-accent bg-accent/15',
                  )}
                  onClick={() =>
                    onFocusDay?.(focusedDate === group.date ? null : group.date)
                  }
                  {...drops}
                >
                  <span
                    data-testid="day-dot"
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: dayColorVar(group.colorIndex) }}
                  />
                  {t('schedule.dayHeading', {
                    day: formatDayLabel(group.date, locale),
                    stops: t('schedule.stops', { count: group.rows.length }),
                  })}
                </button>
              </h3>
            ) : (
              <h3
                data-testid={`day-header-${entry.id}-any`}
                className={cn(
                  'm-0 flex min-h-11 items-center rounded-[8px] px-1 font-semibold text-muted',
                  drops['data-drop-target'] === 'true' &&
                    'outline-2 outline-offset-[-2px] outline-accent bg-accent/15',
                )}
                {...drops}
              >
                {t('schedule.anyDay')}
              </h3>
            )}
            <ul className="m-0 list-none p-0">
              {group.rows.map((row) => {
                const index = untimed.indexOf(row.link.id)
                const reorderable = canEdit && index >= 0
                return (
                  <VisitRow
                    key={row.link.id}
                    entryId={entry.id}
                    group={group}
                    row={row}
                    spots={spots}
                    canEdit={canEdit}
                    locale={locale}
                    selectedLinkId={selectedLinkId}
                    dragRef={dragRef}
                    highlighted={highlightId === row.link.id}
                    dragging={draggingId === row.link.id}
                    dropLine={
                      overId === row.link.id &&
                      draggingId != null &&
                      draggingId !== row.link.id
                    }
                    liRef={(node) => {
                      if (node) rowRefs.current.set(row.link.id, node)
                      else rowRefs.current.delete(row.link.id)
                    }}
                    onDragStart={() => setDraggingId(row.link.id)}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setOverId(null)
                    }}
                    onDragOver={(event) => {
                      const source = dragRef.current
                      if (
                        !canEdit ||
                        !source ||
                        source.entryId !== entry.id ||
                        index < 0 ||
                        !untimed.includes(source.linkId)
                      )
                        return
                      event.preventDefault()
                      setOverId(row.link.id)
                    }}
                    onDrop={() => {
                      if (canEdit && index >= 0) drop(group, row.link.id)
                    }}
                    canMove={canMove}
                    onMoveDialog={onMoveDialog}
                  >
                    {index > 0 && reorderable ? (
                      <MenuItem
                        testId={`move-up-${row.link.id}`}
                        onSelect={() => move(group, index, -1)}
                      >
                        {t('schedule.menuMoveUp')}
                      </MenuItem>
                    ) : null}
                    {reorderable && index < untimed.length - 1 ? (
                      <MenuItem
                        testId={`move-down-${row.link.id}`}
                        onSelect={() => move(group, index, 1)}
                      >
                        {t('schedule.menuMoveDown')}
                      </MenuItem>
                    ) : null}
                    <MenuItem
                      testId={`remove-visit-${row.link.id}`}
                      onSelect={() => {
                        void onRemoveSpot(entry.id, row.link.id)
                      }}
                    >
                      {t('schedule.removeFromBucket')}
                    </MenuItem>
                  </VisitRow>
                )
              })}
            </ul>
          </section>
        )
      })}
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

/** One visit: day-coloured stop number, title, label, ⋯ menu (R-46-02, R-46-04). */
function VisitRow({
  entryId,
  group,
  row,
  spots,
  canEdit,
  locale,
  selectedLinkId,
  dragRef,
  highlighted = false,
  dragging = false,
  dropLine = false,
  liRef,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  canMove,
  onMoveDialog,
  children,
}: {
  entryId: string
  group: DayGroup
  row: DayRow
  spots: Spot[]
  canEdit: boolean
  locale: AppLocale
  selectedLinkId: string | null
  dragRef: { current: DragSource | null }
  highlighted?: boolean
  dragging?: boolean
  dropLine?: boolean
  liRef?: (node: HTMLLIElement | null) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragOver?: (event: DragEvent<HTMLLIElement>) => void
  onDrop?: () => void
  canMove: boolean
  onMoveDialog: (entryId: string, link: PlanLink) => void
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const phone = useMediaQuery(phoneQuery)
  const { link } = row
  const rowSpot = spots.find((spot) => spot.id === link.spotId)
  return (
    <li
      ref={liRef}
      data-testid={`visit-${link.id}`}
      data-day={group.date ?? 'any'}
      data-selected={selectedLinkId === link.id ? 'true' : 'false'}
      data-highlighted={highlighted ? 'true' : 'false'}
      className={cn(
        'border-t border-border py-1',
        highlighted && 'bg-accent/15',
        selectedLinkId === link.id && 'bg-hover',
        dragging && 'opacity-40',
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dropLine ? (
        <div
          data-testid="drop-indicator"
          className="mb-1 h-0.5 bg-foreground"
          aria-hidden="true"
        />
      ) : null}
      <div className="flex items-center gap-1">
        <RowStrip spot={rowSpot} />
        {canEdit && !phone ? (
          <button
            type="button"
            draggable
            data-testid={`drag-${link.id}`}
            aria-label={t('schedule.drag', { spot: link.title })}
            className={cn(
              hoverClass.grab,
              'inline-flex size-11 shrink-0 items-center justify-center rounded-[8px]',
            )}
            onDragStart={(event) => {
              onDragStart?.()
              startDrag(event, { linkId: link.id, entryId }, dragRef)
            }}
            onDragEnd={() => {
              dragRef.current = null
              onDragEnd?.()
            }}
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
        ) : null}
        {row.stopNumber != null ? (
          <span
            data-testid={`stop-number-${link.id}`}
            title={t('schedule.stopNumber', { stop: row.stopNumber })}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: dayColorVar(group.colorIndex) }}
          >
            {row.stopNumber}
          </span>
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
        <RowSymbol spot={rowSpot} />
        {canEdit ? (
          <Menu
            label={t('schedule.rowActions', { spot: link.title })}
            testId={`row-menu-${link.id}`}
            trigger={<MoreHorizontal aria-hidden="true" className="size-4" />}
          >
            {children}
            {canMove ? (
              <MenuItem
                testId={`move-to-${link.id}`}
                onSelect={() => onMoveDialog(entryId, link)}
              >
                {t('schedule.menuMoveTo')}
              </MenuItem>
            ) : null}
          </Menu>
        ) : null}
      </div>
    </li>
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
              hoverClass.item,
              'min-h-11 w-full rounded-[8px] px-3 text-left',
              spot.id === spotId && 'bg-hover',
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
          className={cn(
            hoverClass.item,
            'min-h-11 w-full rounded-[8px] px-3 text-left',
          )}
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
      {failed ? <ErrorNotice>{t('schedule.saveError')}</ErrorNotice> : null}
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
  source: DragSource,
  dragRef: { current: DragSource | null },
) {
  dragRef.current = source
  if (!event.dataTransfer) return
  event.dataTransfer.setData('text/plain', source.linkId)
  event.dataTransfer.effectAllowed = 'move'
}

/** Scrolls into view without animation when the user prefers reduced motion (R-46-07). */
function scrollTo(element: HTMLElement | null) {
  if (!element || typeof element.scrollIntoView !== 'function') return
  const reduced = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches
  element.scrollIntoView({
    block: 'nearest',
    behavior: reduced ? 'auto' : 'smooth',
  })
}
