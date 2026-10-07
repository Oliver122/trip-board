import {
  defaultSpotListQuery,
  spotFiltersActive,
  type Spot,
  type SpotListQuery,
} from '@tripboard/shared'
import { Calendar, House, MessageSquare } from 'lucide-react'
import {
  Fragment,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { CategoryStrip, type Category } from '../components/category'
import { Button } from '../components/ui/button'
import { hoverClass } from '../components/ui/hover'
import { activeLocale } from '../i18n'
import { useListFollowsMap } from '../list-follows-map'
import { phoneQuery, useMediaQuery } from '../lib/media'
import { cn } from '../lib/utils'
import type { LngLatBounds } from '../map/bounds'
import {
  listEmptyKind,
  orderPrimaryHomes,
  pinCategory,
  spotsInView,
  spotSubtitle,
} from './model'
import { SpotToolbar } from './SpotToolbar'

const glyph: Record<'must-go' | 'maybe', string> = {
  'must-go': '!',
  maybe: '?',
}

type Snap = 'peek' | 'half' | 'full'

const peekHeight = 112

function snapHeight(snap: Snap, viewport: number): number {
  if (snap === 'peek') return peekHeight
  if (snap === 'half') return Math.round(viewport * 0.5)
  return Math.round(viewport * 0.92)
}

function nearestSnap(height: number, viewport: number): Snap {
  const options: [Snap, number][] = [
    ['peek', peekHeight],
    ['half', snapHeight('half', viewport)],
    ['full', snapHeight('full', viewport)],
  ]
  return options.reduce((best, item) =>
    Math.abs(item[1] - height) < Math.abs(best[1] - height) ? item : best,
  )[0]
}

export function SpotList({
  tripId,
  tripName,
  timeZone,
  spots,
  total,
  bounds,
  query,
  members,
  entries = [],
  searchDraft,
  onSearchDraft,
  onQuery,
  selectedId,
  onSelect,
  onHover,
}: {
  tripId: string
  tripName: string
  timeZone: string
  spots: Spot[]
  total: number
  bounds: LngLatBounds | null
  query: SpotListQuery
  members: { id: string; name: string }[]
  entries?: { id: string; title: string }[]
  searchDraft: string
  onSearchDraft: (value: string) => void
  onQuery: (query: SpotListQuery) => void
  selectedId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const { t, i18n } = useTranslation()
  const { enabled: listFollowsMap } = useListFollowsMap()
  const phone = useMediaQuery(phoneQuery)
  const [snap, setSnap] = useState<Snap>('peek')
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const shown = orderPrimaryHomes(spotsInView(spots, bounds, query.visible))
  const empty = listEmptyKind(total, spots.length, shown.length)
  const filtered = spotFiltersActive(query)
  const dividerAt =
    query.sort === 'scheduled'
      ? shown.findIndex((spot) => !spot.firstScheduledAt)
      : -1

  useEffect(() => {
    if (!selectedId) return
    document
      .getElementById(`spot-card-${selectedId}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  function onHandlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    const startY = event.clientY
    const viewport = window.innerHeight
    const startHeight = dragHeight ?? snapHeight(snap, viewport)
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const move = (ev: PointerEvent) => {
      const next = startHeight + (startY - ev.clientY)
      const max = snapHeight('full', window.innerHeight)
      setDragHeight(Math.min(max, Math.max(peekHeight, next)))
    }
    const up = (ev: PointerEvent) => {
      const next = startHeight + (startY - ev.clientY)
      setSnap(nearestSnap(next, window.innerHeight))
      setDragHeight(null)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }

  return (
    <aside
      data-testid="spot-list"
      data-sheet={phone ? snap : 'docked'}
      className={cn(
        'flex min-h-0 shrink-0 flex-col bg-card',
        phone
          ? 'fixed inset-x-0 bottom-0 z-30 overflow-hidden rounded-t-card border border-border shadow-panel'
          : 'w-full border-t border-border sm:w-[280px] sm:border-t-0 sm:border-l lg:w-[360px]',
      )}
      style={
        phone
          ? { height: dragHeight ?? snapHeight(snap, window.innerHeight) }
          : undefined
      }
    >
      {phone ? (
        <button
          type="button"
          data-testid="sheet-handle"
          aria-label={t('board.sheet')}
          className={cn(
            hoverClass.ghost,
            'flex w-full touch-none flex-col items-center py-2',
          )}
          onPointerDown={onHandlePointerDown}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setSnap((current) => (current === 'peek' ? 'half' : 'full'))
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              setSnap((current) => (current === 'full' ? 'half' : 'peek'))
            }
          }}
        >
          <span className="block h-1 w-10 rounded-full bg-border" />
        </button>
      ) : null}
      <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
        <h1 className="text-base font-semibold">{t('board.thingsToDo')}</h1>
        <span data-testid="spot-count" className="text-muted">
          {filtered
            ? t('board.countFiltered', { shown: shown.length, total })
            : t('board.count', { count: shown.length })}
        </span>
      </div>
      <SpotToolbar
        tripId={tripId}
        tripName={tripName}
        timeZone={timeZone}
        query={query}
        members={members}
        entries={entries}
        searchDraft={searchDraft}
        onSearchDraft={onSearchDraft}
        onQuery={onQuery}
      />
      <ul
        className={cn(
          'm-0 min-h-0 flex-1 list-none overflow-auto p-0',
          phone && snap === 'peek' && dragHeight == null && 'hidden',
        )}
      >
        {empty === 'trip' ? (
          <li className="p-4">
            <p className="text-muted">{t('board.empty')}</p>
          </li>
        ) : null}
        {empty === 'view' ? (
          <li className="p-4">
            <p className="text-muted">{t('board.emptyView')}</p>
          </li>
        ) : null}
        {empty === 'filters' && filtered ? (
          <li className="p-4">
            <p className="text-muted">{t('board.noMatches')}</p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() =>
                onQuery({ ...defaultSpotListQuery, visible: listFollowsMap })
              }
            >
              {t('board.reset')}
            </Button>
          </li>
        ) : null}
        {shown.map((spot, index) => {
          const category = pinCategory(spot.displayCategory)
          return (
            <Fragment key={spot.id}>
              {dividerAt > 0 && index === dividerAt ? (
                <li
                  data-testid="unscheduled-divider"
                  className="flex items-center gap-2 px-4 py-2 text-xs text-muted"
                >
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  <span>{t('board.notScheduled')}</span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                </li>
              ) : null}
              <li>
                <button
                  type="button"
                  id={`spot-card-${spot.id}`}
                  data-testid={`card-${spot.id}`}
                  className={cn(
                    hoverClass.card,
                    'flex w-full items-stretch gap-3 border-b border-border text-left',
                    selectedId === spot.id && 'bg-background',
                  )}
                  onClick={() => onSelect(spot.id)}
                  onMouseEnter={() => onHover(spot.id)}
                  onMouseLeave={() => onHover(null)}
                >
                  <CategoryStrip category={category} />
                  <span className="min-w-0 flex-1 py-3">
                    <span className="block font-semibold">{spot.title}</span>
                    <span className="block text-muted">
                      {spotSubtitle(spot, locale)}
                    </span>
                  </span>
                  <CommentMark
                    count={spot.commentCount}
                    unread={spot.unreadComments}
                  />
                  <CategoryMark category={category} filled={spot.primary} />
                </button>
              </li>
            </Fragment>
          )
        })}
      </ul>
      <label className="flex min-h-11 items-center gap-2 border-t border-border px-4 text-sm">
        <input
          type="checkbox"
          checked={query.visible}
          onChange={(event) =>
            onQuery({ ...query, visible: event.target.checked })
          }
        />
        {t('board.onlyVisible')}
      </label>
    </aside>
  )
}

function CommentMark({ count, unread }: { count: number; unread: number }) {
  const { t } = useTranslation()
  if (count === 0) return null
  const label =
    unread > 0
      ? `${t('comments.count', { count })}, ${t('news.newCount', { count: unread })}`
      : t('comments.count', { count })
  return (
    <span
      role="img"
      aria-label={label}
      data-testid="comment-count"
      className={cn(
        'inline-flex items-center gap-1 self-center pr-2 text-sm',
        unread > 0 ? 'font-semibold text-accent' : 'text-muted',
      )}
    >
      <MessageSquare
        aria-hidden="true"
        className="size-4"
        fill={unread > 0 ? 'currentColor' : 'none'}
      />
      <span aria-hidden="true">{unread > 0 ? unread : count}</span>
    </span>
  )
}

function CategoryMark({
  category,
  filled,
}: {
  category: Category
  filled: boolean
}) {
  return (
    <span
      className="inline-flex items-center pr-3 text-sm"
      style={{ color: `var(--cat-${category})` }}
    >
      {category === 'planned' ? (
        <Calendar aria-hidden="true" data-icon={category} className="size-4" />
      ) : null}
      {category === 'home' ? (
        <House
          aria-hidden="true"
          data-icon={filled ? 'home-filled' : category}
          fill={filled ? 'currentColor' : 'none'}
          className="size-4"
        />
      ) : null}
      {category === 'must-go' || category === 'maybe' ? (
        <span aria-hidden="true" data-icon={category}>
          {glyph[category]}
        </span>
      ) : null}
    </span>
  )
}
