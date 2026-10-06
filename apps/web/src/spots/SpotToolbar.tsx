import {
  defaultSpotListQuery,
  displayCategories,
  spotFiltersActive,
  spotSorts,
  type DisplayCategory,
  type SpotListQuery,
} from '@tripboard/shared'
import { ArrowUpDown, Download, ListFilter, Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'
import { pinCategory } from './model'

type Member = { id: string; name: string }
type Panel = 'search' | 'filter' | 'sort' | 'export'

export function SpotToolbar({
  query,
  members,
  entries = [],
  searchDraft,
  onSearchDraft,
  onQuery,
}: {
  query: SpotListQuery
  members: Member[]
  entries?: { id: string; title: string }[]
  searchDraft: string
  onSearchDraft: (value: string) => void
  onQuery: (query: SpotListQuery) => void
}) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<Panel | null>(null)
  const searchId = useId()
  const filterId = useId()
  const sortId = useId()
  const exportId = useId()
  const chips = filterChips(query, members, entries, t, onQuery)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null)
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
    onQuery(defaultSpotListQuery)
  }

  return (
    <div ref={rootRef} className="relative border-b border-border">
      <div
        role="toolbar"
        aria-label={t('board.toolbar')}
        className="flex gap-1 px-3 py-2"
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
        <Button
          variant="outline"
          className="size-11 px-0"
          aria-label={t('board.export')}
          aria-expanded={open === 'export'}
          aria-controls={exportId}
          onClick={() => toggle('export')}
        >
          <Download aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {chips.length > 0 ? (
        <ul
          aria-label={t('board.activeFilters')}
          className="m-0 flex list-none flex-wrap gap-1 px-3 pb-2"
        >
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-background px-3 text-sm"
                aria-label={t('board.removeFilter', { label: chip.label })}
                onClick={chip.remove}
              >
                <span>{chip.label}</span>
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open === 'search' ? (
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
      {open === 'filter' ? (
        <div
          id={filterId}
          role="region"
          aria-label={t('board.filter')}
          className="mx-3 mb-2 max-h-[70vh] overflow-auto rounded-card border border-border bg-card p-3 shadow-panel"
        >
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">
              {t('board.category')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {displayCategories.map((category) => (
                <label
                  key={category}
                  className="inline-flex min-h-11 items-center gap-2"
                >
                  <input
                    type="checkbox"
                    checked={query.cat.includes(category)}
                    onChange={() => onQuery(toggleCategory(query, category))}
                  />
                  {t(`category.${pinCategory(category)}`)}
                </label>
              ))}
            </div>
          </fieldset>
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
          <label className="mt-3 block text-sm font-semibold">
            {t('board.addedBy')}
            <select
              className="mt-1 w-full min-h-11 rounded-[8px] border border-border bg-card px-3 font-normal"
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
            </select>
          </label>
          <label className="mt-3 block text-sm font-semibold">
            {t('board.planEntry')}
            <select
              className="mt-1 w-full min-h-11 rounded-[8px] border border-border bg-card px-3 font-normal"
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
            </select>
          </label>
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
      {open === 'sort' ? (
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
      {open === 'export' ? (
        <div
          id={exportId}
          role="region"
          aria-label={t('board.export')}
          className="mx-3 mb-2 rounded-card border border-border bg-card p-3 shadow-panel"
        >
          <p>{t('board.exportLater')}</p>
        </div>
      ) : null}
    </div>
  )
}

function toggleCategory(
  query: SpotListQuery,
  category: DisplayCategory,
): SpotListQuery {
  const cat = query.cat.includes(category)
    ? query.cat.filter((item) => item !== category)
    : [...query.cat, category]
  return { ...query, cat }
}

function filterChips(
  query: SpotListQuery,
  members: Member[],
  entries: { id: string; title: string }[],
  t: (key: string, options?: Record<string, string>) => string,
  onQuery: (query: SpotListQuery) => void,
): { key: string; label: string; remove: () => void }[] {
  const chips: { key: string; label: string; remove: () => void }[] = []
  const trimmed = query.q.trim()
  if (trimmed.length > 0) {
    const label = t('board.searchChip', { q: trimmed })
    chips.push({
      key: 'q',
      label,
      remove: () => onQuery({ ...query, q: '' }),
    })
  }
  for (const category of query.cat) {
    const label = t(`category.${pinCategory(category)}`)
    chips.push({
      key: category,
      label,
      remove: () => onQuery(toggleCategory(query, category)),
    })
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
