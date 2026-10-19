import {
  kindLimits,
  normalizeSpotLink,
  type PlaceFromLink,
  staysOverlap,
  type GeocodeLang,
  type GeocodePlace,
  type PlanEntry,
  type Spot,
  type SpotPlan,
} from '@tripboard/shared'
import { ExternalLink, LoaderCircle, MapPin, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorNotice, FieldError } from '../components/notice'
import { Section } from '../components/phone/Section'
import { Button } from '../components/ui/button'
import { ChipGroup } from '../components/ui/chip-group'
import { useConfirm } from '../components/ui/confirm'
import { hoverClass } from '../components/ui/hover'
import { CategoryBadge, CategoryDot } from '../components/category'
import { kindLabel } from '../kinds/label'
import { useTripKinds } from '../kinds/store'
import { activeLocale } from '../i18n'
import { phoneQuery, useMediaQuery } from '../lib/media'
import { cn } from '../lib/utils'
import { formatDate, formatTime } from '../lib/format'
import { searchAddress } from './client'
import { googleMapsUrl } from './maps-link'
import { placeLinkError, resolvePlaceLink } from './place-link'
import { CopyAddress } from './CopyAddress'
import { Dialog } from './Dialog'
import { listImages } from '../images/client'
import { Gallery } from '../images/Gallery'
import { DraftPhotos } from '../images/DraftPhotos'
import { SpotDiscussion } from '../comments/SpotDiscussion'
import { useTripData } from '../trips/trip-context'
import { InPlans } from './InPlans'
import { draftKinds, type Draft } from './model'

const inputClass =
  'w-full min-h-11 rounded-[8px] border border-border bg-card px-3 text-foreground'

export function SpotPanel({
  mode,
  draft,
  tripId,
  lang,
  saving,
  linkError = null,
  formError = null,
  spot,
  spots,
  plans,
  entries,
  onDraft,
  onLinkPlace,
  linkUnplaced = false,
  onShowOnMap,
  onClose,
  onSubmit,
  onDelete,
  onAddToPlan,
  onRemoveFromPlan,
  onToast,
  focusDiscussion = false,
}: {
  mode: 'add' | 'edit' | 'view'
  draft: Draft
  tripId: string
  lang: GeocodeLang
  saving: boolean
  linkError?: string | null
  formError?: string | null
  spot: Spot | null
  spots: Spot[]
  plans: SpotPlan[]
  entries: PlanEntry[]
  onDraft: (draft: Draft) => void
  /** The *Google Maps link* field found a place (R-33-06). */
  onLinkPlace?: (place: PlaceFromLink) => void
  /** The last lookup found no point, so the pin is still unset (R-33-07). */
  linkUnplaced?: boolean
  /** Phone only: close the panel, show the map and fly to the pin (R-38-02). */
  onShowOnMap?: () => void
  onClose: () => void
  onSubmit: () => void
  onDelete: () => void
  onAddToPlan: (input: {
    entryId: string
    visitDate: string | null
    visitTime: string | null
  }) => Promise<void>
  onRemoveFromPlan: (entryId: string, linkId: string) => Promise<void>
  onToast: (message: string) => void
  focusDiscussion?: boolean
}) {
  const { t, i18n } = useTranslation()
  const confirm = useConfirm()
  const { imageRevision } = useTripData()
  const phone = useMediaQuery(phoneQuery)
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const titleId = useId()
  const addressId = useId()
  const { kinds } = useTripKinds(tripId)
  const stayFromId = useId()
  const stayToId = useId()
  const primaryId = useId()
  const infoId = useId()
  const linkId = useId()
  const mapsLinkId = useId()
  const [mapsLink, setMapsLink] = useState('')
  const [mapsLinkBusy, setMapsLinkBusy] = useState(false)
  const [mapsLinkError, setMapsLinkError] = useState<string | null>(null)
  const readOnly = mode === 'view'
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [section, setSection] = useState<
    'photos' | 'plans' | 'comments' | null
  >(focusDiscussion ? 'comments' : null)
  const [photoCount, setPhotoCount] = useState<number | null>(null)
  const spotId = spot?.id
  const [results, setResults] = useState<GeocodePlace[]>([])
  const [addressFocused, setAddressFocused] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const skipSearch = useRef(false)
  const deleteRef = useRef<HTMLDivElement>(null)
  const refocusDelete = useRef(false)
  const ready =
    draft.title.trim().length > 0 && draft.lat != null && draft.lng != null
  const normalizedLink = normalizeSpotLink(draft.link)
  const linkHref = 'link' in normalizedLink ? normalizedLink.link : null

  // The phone shows the photo count on the collapsed section (R-38-04).
  useEffect(() => {
    if (!phone || !spotId) return
    const controller = new AbortController()
    void listImages(spotId, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setPhotoCount(list.images.length)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [phone, spotId, imageRevision, section])

  useEffect(() => {
    if (!confirming && refocusDelete.current) {
      refocusDelete.current = false
      deleteRef.current
        ?.querySelector<HTMLButtonElement>('[data-testid="spot-delete"]')
        ?.focus()
    }
  }, [confirming])

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

  const overlaps =
    draft.baseCategory === 'home'
      ? spots.filter(
          (other) =>
            other.id !== spot?.id &&
            other.baseCategory === 'home' &&
            staysOverlap(
              draft.stayFrom || null,
              draft.stayTo || null,
              other.stayFrom,
              other.stayTo,
            ),
        )
      : []

  async function leaveHome(): Promise<boolean> {
    const hasStay =
      draft.stayFrom !== '' || draft.stayTo !== '' || draft.primary
    if (!hasStay) return true
    return confirm({
      title: t('confirm.clearStayTitle'),
      message: t('board.clearStay'),
      confirmLabel: t('confirm.clearStayAction'),
      danger: true,
    })
  }

  async function toggleKind(kindId: string) {
    if (!kinds) return
    if (draft.baseCategory === 'home') {
      if (!(await leaveHome())) return
      onDraft({
        ...draft,
        baseCategory: 'kind',
        kindIds: [kindId],
        stayFrom: '',
        stayTo: '',
        primary: false,
      })
      return
    }
    const picked = draft.kindIds.includes(kindId)
    if (picked && draft.kindIds.length === 1) return
    if (!picked && draft.kindIds.length >= kindLimits.perSpot) return
    const wanted = picked
      ? draft.kindIds.filter((id) => id !== kindId)
      : [...draft.kindIds, kindId]
    onDraft({
      ...draft,
      kindIds: kinds
        .filter((kind) => wanted.includes(kind.id))
        .map((k) => k.id),
    })
  }

  function pickHome() {
    if (draft.baseCategory === 'home') return
    onDraft({ ...draft, baseCategory: 'home', kindIds: [] })
  }

  async function fillFromMapsLink() {
    const value = mapsLink.trim()
    if (!value || mapsLinkBusy || !onLinkPlace) return
    setMapsLinkBusy(true)
    setMapsLinkError(null)
    try {
      onLinkPlace(await resolvePlaceLink(tripId, { text: value }))
      setMapsLink('')
    } catch (error) {
      setMapsLinkError(placeLinkError(error, t))
    } finally {
      setMapsLinkBusy(false)
    }
  }

  const toggle = (name: 'photos' | 'plans' | 'comments') =>
    setSection((current) => (current === name ? null : name))

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || saving || readOnly) return
    onSubmit()
  }

  const categoryBlock = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-40 flex-1">
        <p aria-hidden="true" className="mb-1">
          {t('board.category')}
        </p>
        <div className="mb-2">
          <CategoryBadge
            category={draft.baseCategory === 'home' ? 'home' : 'kind'}
            kinds={draftKinds(draft, kinds ?? [])}
          />
        </div>
        <div data-testid="kind-picker" className="flex flex-wrap gap-2">
          <ChipGroup
            label={t('board.category')}
            options={(kinds ?? []).map((kind) => ({
              value: kind.id,
              label: kindLabel(t, kind),
              mark: <CategoryDot kind={kind} />,
            }))}
            value={draft.baseCategory === 'home' ? [] : draft.kindIds}
            max={kindLimits.perSpot}
            maxHint={t('kinds.atMostTwo')}
            disabled={readOnly}
            onChange={(next) => {
              const toggled = [...next, ...draft.kindIds].find(
                (id) => next.includes(id) !== draft.kindIds.includes(id),
              )
              if (toggled) void toggleKind(toggled)
            }}
          />
          <ChipGroup
            label={t('category.home')}
            options={[
              {
                value: 'home',
                label: t('category.home'),
                mark: <CategoryDot category="home" />,
              },
            ]}
            value={draft.baseCategory === 'home' ? ['home'] : []}
            disabled={readOnly}
            onChange={(next) => {
              if (next.includes('home')) pickHome()
            }}
          />
        </div>
      </div>
      {spot && spot.displayCategory === 'planned' ? (
        <p className="pb-3">
          {t('board.plannedBadge', { count: spot.planCount })}
        </p>
      ) : null}
    </div>
  )

  return (
    <Dialog
      title={title}
      closeLabel={phone ? t('board.back') : t('board.close')}
      onClose={onClose}
    >
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
        <div
          data-modal-body
          data-testid="spot-panel-body"
          className="min-h-0 flex-1 space-y-3 overflow-auto overscroll-contain px-4 py-4"
        >
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

          {mode === 'add' && onLinkPlace ? (
            <div>
              <label htmlFor={mapsLinkId} className="mb-1 block">
                {t('places.linkField')}
              </label>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <FieldError
                    message={mapsLinkError}
                    id={`${mapsLinkId}-error`}
                    testId="maps-link-error"
                  >
                    <input
                      id={mapsLinkId}
                      value={mapsLink}
                      placeholder="https://maps.app.goo.gl/…"
                      onChange={(event) => {
                        setMapsLink(event.target.value)
                        setMapsLinkError(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        void fillFromMapsLink()
                      }}
                      className={inputClass}
                    />
                  </FieldError>
                </div>
                <Button
                  variant="outline"
                  className="whitespace-nowrap"
                  data-testid="maps-link-fill"
                  disabled={!mapsLink.trim() || mapsLinkBusy || saving}
                  aria-busy={mapsLinkBusy}
                  onClick={() => void fillFromMapsLink()}
                >
                  {mapsLinkBusy ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin motion-reduce:animate-none"
                    />
                  ) : null}
                  {t('places.fillIn')}
                </Button>
              </div>
            </div>
          ) : null}

          {phone ? categoryBlock : null}

          <Section
            enabled={phone}
            title={t('phone.details')}
            open={detailsOpen}
            onToggle={() => setDetailsOpen((value) => !value)}
            keepMounted
            testId="section-details"
          >
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
            {spot ? (
              <a
                href={googleMapsUrl(spot)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="open-in-maps"
                className={cn(
                  hoverClass.link,
                  'inline-flex min-h-11 items-center gap-2',
                )}
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                {t('phone.openInMaps')}
              </a>
            ) : null}
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
                      className={cn(
                        hoverClass.item,
                        'w-full px-3 py-2 text-left',
                      )}
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
            {linkUnplaced ? (
              <p role="status" data-testid="link-unplaced" className="text-sm">
                {t('places.unplaced')}
              </p>
            ) : null}

            {phone ? null : categoryBlock}

            {draft.baseCategory === 'home' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  <div className="min-w-40 flex-1">
                    <label htmlFor={stayFromId} className="mb-1 block">
                      {t('board.stayFrom')}
                    </label>
                    <input
                      id={stayFromId}
                      type="date"
                      value={draft.stayFrom}
                      readOnly={readOnly}
                      onChange={(event) =>
                        onDraft({ ...draft, stayFrom: event.target.value })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="min-w-40 flex-1">
                    <label htmlFor={stayToId} className="mb-1 block">
                      {t('board.stayTo')}
                    </label>
                    <input
                      id={stayToId}
                      type="date"
                      value={draft.stayTo}
                      readOnly={readOnly}
                      onChange={(event) =>
                        onDraft({ ...draft, stayTo: event.target.value })
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
                <label
                  htmlFor={primaryId}
                  className="flex min-h-11 items-center gap-2"
                >
                  <input
                    id={primaryId}
                    type="checkbox"
                    checked={draft.primary}
                    disabled={readOnly}
                    onChange={(event) =>
                      onDraft({ ...draft, primary: event.target.checked })
                    }
                  />
                  {t('board.primaryHome')}
                </label>
                {overlaps.length > 0 ? (
                  <p role="status" data-testid="stay-overlap">
                    {t('board.stayOverlap', {
                      title: overlaps.map((other) => other.title).join(', '),
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}

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
            <FieldError
              message={
                linkError
                  ? t(
                      linkError === 'too_long'
                        ? 'board.linkTooLong'
                        : 'board.linkInvalid',
                    )
                  : null
              }
              id={`${linkId}-error`}
              testId="link-error"
            >
              <input
                id={linkId}
                value={draft.link}
                readOnly={readOnly}
                onChange={(event) =>
                  onDraft({ ...draft, link: event.target.value })
                }
                className={inputClass}
              />
            </FieldError>
            {linkHref ? (
              <a
                href={linkHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="spot-link"
                className={hoverClass.link}
              >
                {linkHref}
              </a>
            ) : null}
          </Section>

          {onShowOnMap ? (
            <Button
              variant="outline"
              data-testid="show-on-map"
              onClick={onShowOnMap}
            >
              <MapPin aria-hidden="true" className="size-4" />
              {t('phone.showOnMap')}
            </Button>
          ) : null}

          {mode === 'add' && draft.lat != null && draft.lng != null ? (
            <DraftPhotos
              tripId={tripId}
              lat={draft.lat}
              lng={draft.lng}
              photos={draft.photos}
              onChange={(photos) => onDraft({ ...draft, photos })}
              autoOpenSuggestions={draft.fromLink}
              disabled={saving}
            />
          ) : null}

          {spot?.createdBy ? (
            <p className="text-sm text-muted">
              {t('board.createdBy', {
                name: spot.createdBy.name,
                time: `${formatDate(spot.createdAt, locale)} ${formatTime(spot.createdAt, locale)}`,
              })}
            </p>
          ) : null}
          {spot ? (
            <Section
              enabled={phone}
              title={t('phone.photos', { count: photoCount ?? 0 })}
              open={section === 'photos'}
              onToggle={() => toggle('photos')}
              testId="section-photos"
            >
              <Gallery
                spotId={spot.id}
                canEdit={!readOnly}
                revision={imageRevision}
                tripId={tripId}
                title={draft.title}
                address={draft.address}
                lat={spot.lat}
                lng={spot.lng}
              />
            </Section>
          ) : null}
          {spot ? (
            <Section
              enabled={phone}
              title={t('phone.plans', { count: plans.length })}
              open={section === 'plans'}
              onToggle={() => toggle('plans')}
              testId="section-plans"
            >
              <InPlans
                plans={plans}
                entries={entries}
                canEdit={!readOnly}
                onAdd={onAddToPlan}
                onRemove={onRemoveFromPlan}
              />
            </Section>
          ) : null}
          {spot ? (
            <Section
              enabled={phone}
              title={t('phone.comments', { count: spot.commentCount })}
              open={section === 'comments'}
              onToggle={() => toggle('comments')}
              testId="section-comments"
            >
              <SpotDiscussion
                key={spot.id}
                spot={spot}
                onToast={onToast}
                focusOnMount={focusDiscussion}
              />
            </Section>
          ) : null}
        </div>

        {readOnly ? null : (
          <div
            ref={deleteRef}
            className="flex flex-col gap-2 border-t border-border px-4 py-3"
          >
            {formError ? (
              <ErrorNotice testId="form-error">{formError}</ErrorNotice>
            ) : null}
            {confirming ? (
              <div
                data-testid="spot-delete-confirm"
                className="flex flex-wrap items-center justify-end gap-2"
              >
                <p className="min-w-0 basis-full">
                  {t('board.confirmDelete')}
                  {spot && spot.commentCount > 0
                    ? ` ${t('board.confirmDeleteComments', { count: spot.commentCount })}`
                    : null}
                </p>
                <Button
                  variant="outline"
                  className="whitespace-nowrap"
                  onClick={() => {
                    refocusDelete.current = true
                    setConfirming(false)
                  }}
                >
                  {t('board.cancel')}
                </Button>
                <Button
                  variant="dangerSolid"
                  className="whitespace-nowrap"
                  onClick={onDelete}
                  disabled={saving}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  {t('board.delete')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {mode === 'edit' ? (
                  <Button
                    variant="danger"
                    size="icon"
                    aria-label={t('board.deleteSpot')}
                    title={t('board.deleteSpot')}
                    data-testid="spot-delete"
                    onClick={() => setConfirming(true)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="whitespace-nowrap"
                    onClick={onClose}
                  >
                    {t('board.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    className="whitespace-nowrap"
                    disabled={!ready || saving}
                  >
                    {mode === 'add' ? t('board.add') : t('board.save')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </Dialog>
  )
}
