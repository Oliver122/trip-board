import type {
  GeocodeLang,
  GeocodePlace,
  PlanEntry,
  Spot,
  SpotPlan,
} from '@tripboard/shared'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { activeLocale } from '../i18n'
import { formatDate, formatTime } from '../lib/format'
import { searchAddress } from './client'
import { CopyAddress } from './CopyAddress'
import { Dialog } from './Dialog'
import { Gallery } from '../images/Gallery'
import { InPlans } from './InPlans'
import { pinCategory, type Draft } from './model'

const categories = ['must_go', 'maybe', 'home'] as const

const inputClass =
  'w-full min-h-11 rounded-[8px] border border-border bg-card px-3 text-foreground'

export function SpotPanel({
  mode,
  draft,
  tripId,
  lang,
  saving,
  spot,
  plans,
  entries,
  onDraft,
  onClose,
  onSubmit,
  onDelete,
  onAddToPlan,
  onRemoveFromPlan,
}: {
  mode: 'add' | 'edit' | 'view'
  draft: Draft
  tripId: string
  lang: GeocodeLang
  saving: boolean
  spot: Spot | null
  plans: SpotPlan[]
  entries: PlanEntry[]
  onDraft: (draft: Draft) => void
  onClose: () => void
  onSubmit: () => void
  onDelete: () => void
  onAddToPlan: (input: {
    entryId: string
    visitDate: string | null
    visitTime: string | null
  }) => Promise<void>
  onRemoveFromPlan: (entryId: string, linkId: string) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const titleId = useId()
  const addressId = useId()
  const categoryId = useId()
  const infoId = useId()
  const linkId = useId()
  const readOnly = mode === 'view'
  const [results, setResults] = useState<GeocodePlace[]>([])
  const [addressFocused, setAddressFocused] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const skipSearch = useRef(false)
  const ready =
    draft.title.trim().length > 0 && draft.lat != null && draft.lng != null

  useEffect(() => {
    if (readOnly || !addressFocused) return
    if (skipSearch.current) {
      skipSearch.current = false
      return
    }
    const query = draft.address.trim()
    if (query.length < 2) {
      setResults([])
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void searchAddress(query, lang, tripId, controller.signal)
        .then((places) => {
          if (!controller.signal.aborted) setResults(places)
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults([])
        })
    }, 250)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [addressFocused, draft.address, lang, readOnly, tripId])

  const title =
    mode === 'add'
      ? t('board.panelAdd')
      : mode === 'view'
        ? t('board.panelView')
        : t('board.panelEdit')

  function choose(place: GeocodePlace) {
    skipSearch.current = true
    setResults([])
    onDraft({
      ...draft,
      address: place.label,
      lat: place.lat,
      lng: place.lng,
    })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || saving || readOnly) return
    onSubmit()
  }

  return (
    <Dialog title={title} closeLabel={t('board.close')} onClose={onClose}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
          <label htmlFor={titleId} className="block">
            {t('board.spotTitle')}
          </label>
          <input
            id={titleId}
            value={draft.title}
            readOnly={readOnly}
            onChange={(event) =>
              onDraft({ ...draft, title: event.target.value })
            }
            className={inputClass}
          />

          <label htmlFor={addressId} className="block">
            {t('board.address')}
          </label>
          <div className="flex gap-2">
            <input
              id={addressId}
              value={draft.address}
              readOnly={readOnly}
              onFocus={() => setAddressFocused(true)}
              onBlur={() => setAddressFocused(false)}
              onChange={(event) =>
                onDraft({ ...draft, address: event.target.value })
              }
              className={inputClass}
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="address-results"
            />
            {draft.address ? <CopyAddress address={draft.address} /> : null}
          </div>
          {results.length > 0 ? (
            <ul
              id="address-results"
              role="listbox"
              className="m-0 list-none p-0"
            >
              {results.map((place) => (
                <li key={`${place.label}-${place.lat}-${place.lng}`}>
                  <button
                    type="button"
                    role="option"
                    className="w-full px-3 py-2 text-left hover:bg-background"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(place)}
                  >
                    {place.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {readOnly ? null : (
            <p className="text-sm text-muted">{t('board.placeHint')}</p>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-40 flex-1">
              <label htmlFor={categoryId} className="mb-1 block">
                {t('board.category')}
              </label>
              <select
                id={categoryId}
                value={draft.baseCategory}
                disabled={readOnly}
                onChange={(event) =>
                  onDraft({
                    ...draft,
                    baseCategory: event.target.value as Draft['baseCategory'],
                  })
                }
                className={inputClass}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {t(`category.${pinCategory(category)}`)}
                  </option>
                ))}
              </select>
            </div>
            {spot && spot.displayCategory === 'planned' ? (
              <p className="pb-3">
                {t('board.plannedBadge', { count: spot.planCount })}
              </p>
            ) : null}
          </div>

          <label htmlFor={infoId} className="block">
            {t('board.info')}
          </label>
          <textarea
            id={infoId}
            value={draft.info}
            readOnly={readOnly}
            rows={3}
            placeholder={t('board.infoPlaceholder')}
            onChange={(event) =>
              onDraft({ ...draft, info: event.target.value })
            }
            className={inputClass}
          />

          <label htmlFor={linkId} className="block">
            {t('board.link')}
          </label>
          <input
            id={linkId}
            value={draft.link}
            readOnly={readOnly}
            onChange={(event) =>
              onDraft({ ...draft, link: event.target.value })
            }
            className={inputClass}
          />

          {spot?.createdBy ? (
            <p className="text-sm text-muted">
              {t('board.createdBy', {
                name: spot.createdBy.name,
                time: `${formatDate(spot.createdAt, locale)} ${formatTime(spot.createdAt, locale)}`,
              })}
            </p>
          ) : null}
          {spot ? <Gallery spotId={spot.id} canEdit={!readOnly} /> : null}
          {spot ? (
            <InPlans
              plans={plans}
              entries={entries}
              canEdit={!readOnly}
              onAdd={onAddToPlan}
              onRemove={onRemoveFromPlan}
            />
          ) : null}
        </div>

        {readOnly ? null : (
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
            {confirming ? (
              <>
                <p>{t('board.confirmDelete')}</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setConfirming(false)}
                  >
                    {t('board.cancel')}
                  </Button>
                  <Button onClick={onDelete} disabled={saving}>
                    {t('board.deleteSpot')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {mode === 'edit' ? (
                  <Button variant="outline" onClick={() => setConfirming(true)}>
                    {t('board.delete')}
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>
                    {t('board.cancel')}
                  </Button>
                  <Button type="submit" disabled={!ready || saving}>
                    {mode === 'add' ? t('board.add') : t('board.save')}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </form>
    </Dialog>
  )
}
