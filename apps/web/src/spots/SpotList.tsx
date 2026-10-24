import {
  defaultSpotListQuery,
  spotFiltersActive,
  type GeocodeLang,
  type Spot,
  type SpotListQuery,
} from '@tripboard/shared'
import { Fragment, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { activeLocale } from '../i18n'
import { useListFollowsMap } from '../list-follows-map'
import { phoneQuery, useMediaQuery } from '../lib/media'
import { cn } from '../lib/utils'
import type { LngLatBounds } from '../map/bounds'
import { SpotCard } from '../list/SpotCard'
import { listEmptyKind, orderPrimaryHomes, spotsInView } from './model'
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
          return (
            <Fragment key={spot.id}>
              {dividerAt > 0 && index === dividerAt ? (
                <li
                  data-testid="unscheduled-divider"
                  className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted"
                >
                  <span>{t('board.notScheduled')}</span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                </li>
              ) : null}
              <SpotCard
                spot={spot}
                locale={locale}
                phone={phone}
                selected={selectedId === spot.id}
                onSelect={onSelect}
                onHover={onHover}
              />
            </Fragment>
          )
        })}
      </ul>
      {phone ? null : (
        <Switch
          checked={query.visible}
          onChange={(visible) => onQuery({ ...query, visible })}
          testId="only-visible"
          className="border-t border-border px-4 text-sm"
        >
          {t('board.onlyVisible')}
        </Switch>
      )}
    </aside>
  )
}
