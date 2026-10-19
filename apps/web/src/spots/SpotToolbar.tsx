import {
  defaultSpotListQuery,
  spotFiltersActive,
  spotSorts,
  type GeocodeLang,
  type Spot,
  type SpotKind,
  type SpotListQuery,
} from '@tripboard/shared'
import {
  ArrowUpDown,
  Download,
  ListFilter,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { ChipGroup } from '../components/ui/chip-group'
import { hoverClass } from '../components/ui/hover'
import { Select } from '../components/ui/select'
import { useListFollowsMap } from '../list-follows-map'
import { phoneQuery, useMediaQuery } from '../lib/media'
import { cn } from '../lib/utils'
import { ExportDialog } from './ExportDialog'
import { CategoryDot } from '../components/category'
import { kindLabel } from '../kinds/label'
import { useTripKinds } from '../kinds/store'
import { categoryCounts, collapseLabels } from './model'

const ImportDialog = lazy(() =>
  import('../import/ImportDialog').then((mod) => ({
    default: mod.ImportDialog,
  })),
)

type Member = { id: string; name: string }
type Panel = 'search' | 'filter' | 'sort'

export function SpotToolbar({
  tripId,
  tripName,
  timeZone,
  lang,
  query,
  members,
  entries = [],
  existingSpots,
  canImport,
  searchDraft,
  onSearchDraft,
  onQuery,
  onImported,
  onAuthError,
}: {
  tripId: string
  tripName: string
  timeZone: string
  lang: GeocodeLang
  query: SpotListQuery
  members: Member[]
  entries?: { id: string; title: string }[]
  existingSpots: Spot[]
  canImport: boolean
  searchDraft: string
  onSearchDraft: (value: string) => void
  onQuery: (query: SpotListQuery) => void
  onImported: (spots: Spot[]) => void
  onAuthError: () => void
}) {
  const { t } = useTranslation()
  const { enabled: listFollowsMap } = useListFollowsMap()
  const phone = useMediaQuery(phoneQuery)
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<Panel | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const searchId = useId()
  const filterId = useId()
  const sortId = useId()
  const { kinds } = useTripKinds(tripId)
  const chips = filterChips(query, members, entries, kinds ?? [], t, onQuery)
  const filterItems = categoryFilters(kinds ?? [], t)
  const filterTokens = filterItems.map((item) => item.token)
  const counts = categoryCounts(existingSpots)
  const moreId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node) || !target.isConnected) return
      if (!rootRef.current?.contains(target)) setOpen(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    document.addEventListener('click', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle(panel: Panel) {
    setOpen((current) => (current === panel ? null : panel))
  }

  function reset() {
    setOpen(null)
    onQuery({ ...defaultSpotListQuery, visible: listFollowsMap })
  }

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-0 flex-col border-b border-border"
    >
      {phone ? (
        <div className="px-3 py-2">
          <Button
            variant="outline"
            data-testid="filters"
            aria-expanded={open != null}
            aria-controls={filterId}
            onClick={() => setOpen((current) => (current ? null : 'filter'))}
          >
            <ListFilter aria-hidden="true" className="size-4" />
            {t('board.filters')}
          </Button>
        </div>
      ) : null}
      <div
        role="toolbar"
        aria-label={t('board.toolbar')}
        className={cn('flex gap-1 px-3 py-2', phone && 'hidden')}
      >
        <Button
          variant="outline"
          className={cn('size-11 px-0', query.q.trim() && 'bg-background')}
          aria-label={t('board.search')}
          aria-expanded={open === 'search'}
          aria-controls={searchId}
          aria-pressed={query.q.trim().length > 0}
          onClick={() => toggle('search')}
        >
          <Search aria-hidden="true" className="size-4" />
        </Button>
        <Button
          variant="outline"
          className={cn(
            'size-11 px-0',
            spotFiltersActive(query) && 'bg-background',
          )}
          aria-label={t('board.filter')}
          aria-expanded={open === 'filter'}
          aria-controls={filterId}
          aria-pressed={spotFiltersActive(query)}
          onClick={() => toggle('filter')}
        >
          <ListFilter aria-hidden="true" className="size-4" />
        </Button>
        <Button
          variant="outline"
          className={cn(
            'size-11 px-0',
            query.sort !== 'scheduled' && 'bg-background',
          )}
          aria-label={t('board.sort')}
          aria-expanded={open === 'sort'}
          aria-controls={sortId}
          aria-pressed={query.sort !== 'scheduled'}
          onClick={() => toggle('sort')}
        >
          <ArrowUpDown aria-hidden="true" className="size-4" />
        </Button>
        {phone ? null : (
          <Button
            variant="outline"
            className="size-11 px-0"
            aria-label={t('board.export')}
            aria-expanded={exportOpen}
            aria-haspopup="dialog"
            onClick={() => {
              setOpen(null)
              setExportOpen(true)
            }}
          >
            <Download aria-hidden="true" className="size-4" />
          </Button>
        )}
        {canImport && !phone ? (
          <Button
            variant="outline"
            className="size-11 px-0"
            aria-label={t('board.import')}
            aria-expanded={importOpen}
            aria-haspopup="dialog"
            onClick={() => {
              setOpen(null)
              setImportOpen(true)
            }}
          >
            <Upload aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </div>
      {chips.length > 0 ? (
        <ul
          aria-label={t('board.activeFilters')}
          className="m-0 flex list-none flex-wrap gap-1 px-3 pb-2"
        >
          {chips.map((chip) => (
            <li key={chip.key} className="group relative">
              <button
                type="button"
                className={cn(
                  hoverClass.ghost,
                  'inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-background px-3 text-sm text-foreground',
                )}
                style={chip.color ? { borderColor: chip.color } : undefined}
                aria-label={t('board.removeFilter', {
                  label: chip.full ?? chip.label,
                })}
                aria-describedby={
                  chip.full ? `${moreId}-${chip.key}` : undefined
                }
                onClick={chip.remove}
              >
                <span>{chip.label}</span>
                <X aria-hidden="true" className="size-3" />
              </button>
              {chip.full ? (
                <span
                  id={`${moreId}-${chip.key}`}
                  role="tooltip"
                  className="absolute left-0 top-full z-10 mt-1 hidden w-max max-w-64 rounded-[8px] border border-border bg-card px-3 py-2 text-sm text-foreground shadow-panel group-focus-within:block group-hover:block"
                >
                  {chip.full}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open === 'search' || (phone && open != null) ? (
        <div
          id={searchId}
          role="region"
          aria-label={t('board.search')}
          className="mx-3 mb-2 rounded-card border border-border bg-card p-3 shadow-panel"
        >
          <input
            autoFocus
            type="search"
            aria-label={t('board.search')}
            placeholder={t('board.search')}
            value={searchDraft}
            onChange={(event) => onSearchDraft(event.target.value)}
            className="w-full min-h-11 rounded-[8px] border border-border bg-card px-3"
          />
          <p className="mt-2 text-sm text-muted">{t('board.searchHint')}</p>
        </div>
      ) : null}
      {open === 'filter' || (phone && open != null) ? (
        <div
          id={filterId}
          role="region"
          aria-label={t('board.filter')}
          className="mx-3 mb-2 max-h-[70vh] min-h-0 overflow-auto overscroll-contain rounded-card border border-border bg-card p-3 shadow-panel"
        >
          <div>
            <p aria-hidden="true" className="mb-2 text-sm font-semibold">
              {t('board.category')}
            </p>
            <div className="mb-2 flex gap-2">
              <Button
                variant="outline"
                className="min-h-9 px-3"
                onClick={() => onQuery({ ...query, cat: filterTokens })}
              >
                {t('ui.chips.all')}
              </Button>
              <Button
                variant="outline"
                className="min-h-9 px-3"
                disabled={query.cat.length === 0}
                onClick={() => onQuery({ ...query, cat: [] })}
              >
                {t('ui.chips.clear')}
              </Button>
            </div>
            <ChipGroup
              testId="filter-categories"
              label={t('board.category')}
              options={filterItems.map((item) => ({
                value: item.token,
                label: item.label,
                count: counts[item.token] ?? 0,
                mark: item.kind ? (
                  <CategoryDot kind={item.kind} />
                ) : (
                  <CategoryDot category={item.system} />
                ),
              }))}
              value={query.cat}
              onChange={(cat) => onQuery({ ...query, cat })}
            />
          </div>
          <fieldset className="m-0 mt-3 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">
              {t('board.status')}
            </legend>
            {(['all', 'scheduled', 'unscheduled'] as const).map((status) => (
              <label key={status} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="spot-status"
                  checked={query.status === status}
                  onChange={() => onQuery({ ...query, status })}
                />
                {t(
                  status === 'all'
                    ? 'board.statusAll'
                    : status === 'scheduled'
                      ? 'board.statusScheduled'
                      : 'board.statusUnscheduled',
                )}
              </label>
            ))}
          </fieldset>
          <div className="mt-3">
            <Select
              label={t('board.addedBy')}
              value={query.by ?? ''}
              onChange={(event) =>
                onQuery({
                  ...query,
                  by: event.target.value === '' ? null : event.target.value,
                })
              }
            >
              <option value="">{t('board.anyone')}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
              {query.by && !members.some((member) => member.id === query.by) ? (
                <option value={query.by}>{query.by}</option>
              ) : null}
            </Select>
          </div>
          <div className="mt-3">
            <Select
              label={t('board.planEntry')}
              value={query.entry ?? ''}
              onChange={(event) =>
                onQuery({
                  ...query,
                  entry: event.target.value === '' ? null : event.target.value,
                })
              }
            >
              <option value="">{t('board.anyEntry')}</option>
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title}
                </option>
              ))}
              {query.entry &&
              !entries.some((entry) => entry.id === query.entry) ? (
                <option value={query.entry}>{query.entry}</option>
              ) : null}
            </Select>
          </div>
          <label className="mt-3 flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={query.visible}
              onChange={(event) =>
                onQuery({ ...query, visible: event.target.checked })
              }
            />
            {t('board.onlyVisible')}
          </label>
          <Button variant="outline" className="mt-3" onClick={reset}>
            {t('board.reset')}
          </Button>
        </div>
      ) : null}
      {open === 'sort' || (phone && open != null) ? (
        <div
          id={sortId}
          role="region"
          aria-label={t('board.sort')}
          className="mx-3 mb-2 rounded-card border border-border bg-card p-3 shadow-panel"
        >
          <fieldset className="m-0 border-0 p-0">
            <legend className="sr-only">{t('board.sort')}</legend>
            {spotSorts.map((sort) => (
              <label key={sort} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="spot-sort"
                  checked={query.sort === sort}
                  onChange={() => onQuery({ ...query, sort })}
                />
                {t(`board.sorts.${sort}`)}
              </label>
            ))}
          </fieldset>
        </div>
      ) : null}
      {exportOpen ? (
        <ExportDialog
          tripId={tripId}
          tripName={tripName}
          timeZone={timeZone}
          query={query}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
      {importOpen ? (
        <Suspense fallback={null}>
          <ImportDialog
            tripId={tripId}
            lang={lang}
            existingSpots={existingSpots}
            onClose={() => setImportOpen(false)}
            onImported={(spots) => {
              setImportOpen(false)
              onImported(spots)
            }}
            onAuthError={() => {
              setImportOpen(false)
              onAuthError()
            }}
          />
        </Suspense>
      ) : null}
    </div>
  )
}

/** More selected categories than this collapse into one "Food +3" chip. */
const maxCategoryChips = 3

type FilterChip = {
  key: string
  label: string
  color?: string
  /** Every name behind a collapsed chip, for the tooltip and accessible name. */
  full?: string
  remove: () => void
}

type CategoryFilterItem = {
  token: string
  label: string
  kind?: SpotKind
  system?: 'planned' | 'home'
}

/** One filter per kind in kind order, then Planned and Home. */
function categoryFilters(
  kinds: readonly SpotKind[],
  t: TFunction,
): CategoryFilterItem[] {
  return [
    ...kinds.map((kind) => ({
      token: kind.id,
      kind,
      label: kindLabel(t, kind),
    })),
    {
      token: 'planned',
      system: 'planned' as const,
      label: t('category.planned'),
    },
    { token: 'home', system: 'home' as const, label: t('category.home') },
  ]
}

function toggleCategory(query: SpotListQuery, category: string): SpotListQuery {
  const cat = query.cat.includes(category)
    ? query.cat.filter((item) => item !== category)
    : [...query.cat, category]
  return { ...query, cat }
}

function filterChips(
  query: SpotListQuery,
  members: Member[],
  entries: { id: string; title: string }[],
  kinds: readonly SpotKind[],
  t: TFunction,
  onQuery: (query: SpotListQuery) => void,
): FilterChip[] {
  const chips: FilterChip[] = []
  const trimmed = query.q.trim()
  if (trimmed.length > 0) {
    const label = t('board.searchChip', { q: trimmed })
    chips.push({
      key: 'q',
      label,
      remove: () => onQuery({ ...query, q: '' }),
    })
  }
  const known = query.cat
    .map((category) =>
      // A kind that is gone or not loaded yet has no name to show.
      categoryFilters(kinds, t).find((item) => item.token === category),
    )
    .filter((item): item is CategoryFilterItem => item != null)
  const collapsed = collapseLabels(
    known.map((item) => item.label),
    maxCategoryChips,
  )
  if (collapsed) {
    chips.push({
      key: 'cat',
      label: t('ui.chips.more', {
        first: collapsed.first,
        count: collapsed.more,
      }),
      color: known[0]?.kind?.color,
      full: known.map((item) => item.label).join(', '),
      remove: () => onQuery({ ...query, cat: [] }),
    })
  } else {
    for (const item of known) {
      chips.push({
        key: item.token,
        label: item.label,
        color: item.kind?.color,
        remove: () => onQuery(toggleCategory(query, item.token)),
      })
    }
  }
  if (query.status !== 'all') {
    const label = t(
      query.status === 'scheduled'
        ? 'board.statusScheduled'
        : 'board.statusUnscheduled',
    )
    chips.push({
      key: 'status',
      label,
      remove: () => onQuery({ ...query, status: 'all' }),
    })
  }
  if (query.by) {
    const label =
      members.find((member) => member.id === query.by)?.name ?? query.by
    chips.push({
      key: 'by',
      label,
      remove: () => onQuery({ ...query, by: null }),
    })
  }
  if (query.entry) {
    const label =
      entries.find((entry) => entry.id === query.entry)?.title ??
      t('board.planEntry')
    chips.push({
      key: 'entry',
      label,
      remove: () => onQuery({ ...query, entry: null }),
    })
  }
  return chips
}
