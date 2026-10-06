import {
  defaultSpotListQuery,
  spotFiltersActive,
  type Spot,
  type SpotListQuery,
} from '@tripboard/shared'
import { Calendar, House } from 'lucide-react'
import { Fragment, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CategoryStrip, type Category } from '../components/category'
import { Button } from '../components/ui/button'
import { activeLocale } from '../i18n'
import { cn } from '../lib/utils'
import type { LngLatBounds } from '../map/bounds'
import { listEmptyKind, pinCategory, spotsInView, spotSubtitle } from './model'
import { SpotToolbar } from './SpotToolbar'

const glyph: Record<'must-go' | 'maybe', string> = {
  'must-go': '!',
  maybe: '?',
}

export function SpotList({
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
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const shown = spotsInView(spots, bounds, query.visible)
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
      className="flex w-full shrink-0 flex-col border-t border-border bg-card lg:w-[360px] lg:border-t-0 lg:border-l"
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
        query={query}
        members={members}
        entries={entries}
        searchDraft={searchDraft}
        onSearchDraft={onSearchDraft}
        onQuery={onQuery}
      />
      <ul className="m-0 min-h-0 flex-1 list-none overflow-auto p-0">
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
              onClick={() => onQuery(defaultSpotListQuery)}
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
                  <CategoryMark category={category} />
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

function CategoryMark({ category }: { category: Category }) {
  return (
    <span
      className="inline-flex items-center pr-3 text-sm"
      style={{ color: `var(--cat-${category})` }}
    >
      {category === 'planned' ? (
        <Calendar aria-hidden="true" data-icon={category} className="size-4" />
      ) : null}
      {category === 'home' ? (
        <House aria-hidden="true" data-icon={category} className="size-4" />
      ) : null}
      {category === 'must-go' || category === 'maybe' ? (
        <span aria-hidden="true" data-icon={category}>
          {glyph[category]}
        </span>
      ) : null}
    </span>
  )
}
