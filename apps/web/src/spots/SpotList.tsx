import {
  defaultSpotListQuery,
  spotFiltersActive,
  type GeocodeLang,
  type Spot,
  type SpotListQuery,
} from '@tripboard/shared'
import { Calendar, House, MapPin, MessageSquare } from 'lucide-react'
import { Fragment, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  categoryColor,
  CategoryStrip,
  type Category,
} from '../components/category'
import { KindSymbolIcon } from '../kinds/symbols'
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
  spotsInView,
  spotSubtitle,
} from './model'
import { googleMapsUrl } from './maps-link'
import { SpotToolbar } from './SpotToolbar'

export function SpotList({
  tripId,
  tripName,
  timeZone,
  lang,
  spots,
  existingSpots,
  canImport,
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
  onImported,
  onAuthError,
}: {
  tripId: string
  tripName: string
  timeZone: string
  lang: GeocodeLang
  spots: Spot[]
  existingSpots: Spot[]
  canImport: boolean
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
  onImported: (spots: Spot[]) => void
  onAuthError: () => void
}) {
  const { t, i18n } = useTranslation()
  const { enabled: listFollowsMap } = useListFollowsMap()
  const phone = useMediaQuery(phoneQuery)
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

  return (
    <aside
      data-testid="spot-list"
      data-layout={phone ? 'full' : 'docked'}
      className={cn(
        'flex min-h-0 flex-col bg-card',
        phone
          ? 'w-full flex-1'
          : 'w-full flex-1 border-t border-border sm:w-[280px] sm:border-t-0 sm:border-l lg:w-[360px]',
      )}
    >
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
        lang={lang}
        query={query}
        members={members}
        entries={entries}
        existingSpots={existingSpots}
        canImport={canImport}
        searchDraft={searchDraft}
        onSearchDraft={onSearchDraft}
        onQuery={onQuery}
        onImported={onImported}
        onAuthError={onAuthError}
      />
      <ul
        data-testid="spot-list-items"
        className={cn(
          // Keeps room for the list when an open filter panel fills the column.
          'm-0 min-h-24 flex-1 list-none overflow-auto overscroll-contain p-0',
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
          const category = spot.displayCategory
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
              <li className="relative">
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
                  <CategoryStrip category={category} kinds={spot.kinds} />
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
                  <CategoryMark
                    category={category}
                    kinds={spot.kinds}
                    filled={spot.primary}
                  />
                  {phone ? (
                    <span className="w-12 shrink-0" aria-hidden="true" />
                  ) : null}
                </button>
                {phone ? (
                  <a
                    href={googleMapsUrl(spot)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`card-maps-${spot.id}`}
                    aria-label={t('phone.openSpotInMaps', {
                      title: spot.title,
                    })}
                    className={cn(
                      hoverClass.ghost,
                      'absolute right-0 top-1/2 inline-flex size-12 -translate-y-1/2 items-center justify-center',
                    )}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MapPin aria-hidden="true" className="size-5" />
                  </a>
                ) : null}
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
  kinds,
  filled,
}: {
  category: Category
  kinds: Spot['kinds']
  filled: boolean
}) {
  return (
    <span
      className="inline-flex items-center gap-1 pr-3 text-sm"
      style={
        category === 'kind' ? undefined : { color: categoryColor(category) }
      }
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
      {category === 'kind'
        ? kinds.map((kind) => (
            <span key={kind.id} style={{ color: kind.color }}>
              <KindSymbolIcon symbol={kind.symbol} className="size-4" />
            </span>
          ))
        : null}
    </span>
  )
}
