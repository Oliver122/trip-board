import {
  kindLimits,
  type GeocodeLang,
  type Spot,
  type SpotImportSource,
  type SpotKind,
} from '@tripboard/shared'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { ChipGroup } from '../components/ui/chip-group'
import { CategoryDot } from '../components/category'
import { hoverClass } from '../components/ui/hover'
import { Modal } from '../components/ui/modal'
import { cn } from '../lib/utils'
import { searchAddress } from '../spots/client'
import { isAuth } from '../api/http'
import { importSpots } from './client'
import { kindLabel } from '../kinds/label'
import { useTripKinds } from '../kinds/store'
import { categoryBody } from '../spots/model'
import { markDuplicates, type DuplicateCandidate } from './duplicates'
import { locateRows, type Located } from './locate'
import type { ParseError, ParsedRow } from './model'
import { parseImportFile } from './parse'

type PreviewRow = Located<ParsedRow> & {
  id: string
  duplicate: boolean
  ticked: boolean
}

type Stage =
  | { name: 'pick' }
  | { name: 'error'; error: ParseError }
  | { name: 'locating'; done: number; total: number }
  | { name: 'preview' }
  | { name: 'importing' }

const takeoutUrl = 'https://takeout.google.com'

export function ImportDialog({
  tripId,
  lang,
  existingSpots,
  onClose,
  onImported,
  onAuthError,
}: {
  tripId: string
  lang: GeocodeLang
  existingSpots: DuplicateCandidate[]
  onClose: () => void
  onImported: (spots: Spot[]) => void
  onAuthError: () => void
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const [stage, setStage] = useState<Stage>({ name: 'pick' })
  const [source, setSource] = useState<SpotImportSource | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const { kinds } = useTripKinds(tripId)
  const [pick, setPick] = useState<KindPick>({
    home: false,
    kindIds: [],
  })
  // Nothing picked yet means the trip's first kind, the default.
  const effective =
    pick.kindIds.length > 0
      ? pick.kindIds
      : (kinds ?? []).slice(0, 1).map((k) => k.id)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  function close() {
    abortRef.current?.abort()
    onClose()
  }

  async function handleFile(file: File) {
    setSubmitError(null)
    const result = await parseImportFile(file)
    if (!result.ok) {
      setStage({ name: 'error', error: result.error })
      return
    }
    setSource(result.source)
    const controller = new AbortController()
    abortRef.current = controller
    setStage({ name: 'locating', done: 0, total: result.rows.length })
    const located = await locateRows(
      result.rows,
      async (query, signal) => {
        const places = await searchAddress(query, lang, tripId, signal)
        const first = places[0]
        return first
          ? { lat: first.lat, lng: first.lng, label: first.label }
          : null
      },
      controller.signal,
      (done, total) => setStage({ name: 'locating', done, total }),
    )
    const duplicateFlags = markDuplicates(located, existingSpots)
    const preview: PreviewRow[] = located.map((row, index) => ({
      ...row,
      id: String(index),
      duplicate: duplicateFlags[index] ?? false,
      ticked: row.locationStatus !== 'not_found' && !duplicateFlags[index],
    }))
    setRows(preview)
    setStage({ name: 'preview' })
  }

  function pickAnother() {
    setRows([])
    setSource(null)
    setStage({ name: 'pick' })
  }

  function toggle(id: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, ticked: !row.ticked } : row,
      ),
    )
  }

  function pickPlace(
    id: string,
    place: { lat: number; lng: number; label: string },
  ) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              lat: place.lat,
              lng: place.lng,
              locationStatus: 'found',
              foundLabel: place.label,
              ticked: true,
            }
          : row,
      ),
    )
  }

  const ticked = rows.filter((row) => row.ticked)

  async function submit() {
    if (ticked.length === 0 || !source) return
    setStage({ name: 'importing' })
    try {
      const result = await importSpots(tripId, {
        source,
        ...categoryBody(
          {
            baseCategory: pick.home ? 'home' : 'kind',
            kindIds: effective,
          },
          kinds ?? [],
        ),
        spots: ticked.map((row) => ({
          title: row.title,
          lat: row.lat as number,
          lng: row.lng as number,
          address: row.address,
          info: row.info,
          link: row.link,
        })),
      })
      onImported(result.spots)
      onClose()
    } catch (error) {
      if (isAuth(error)) {
        onAuthError()
        return
      }
      setSubmitError(t('board.saveError'))
      setStage({ name: 'preview' })
    }
  }

  const footer =
    stage.name === 'preview' || stage.name === 'importing' ? (
      <div className="flex w-full items-center justify-between gap-3">
        {submitError ? (
          <p role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        ) : (
          <button
            type="button"
            className={cn(hoverClass.link, 'text-sm underline')}
            onClick={pickAnother}
          >
            {t('board.importTryAgain')}
          </button>
        )}
        <Button
          disabled={ticked.length === 0 || stage.name === 'importing'}
          onClick={() => void submit()}
        >
          {t('board.importCount', { count: ticked.length })}
        </Button>
      </div>
    ) : undefined

  return (
    <Modal
      title={t('board.importTitle')}
      closeLabel={t('board.close')}
      size="lg"
      onClose={close}
      footer={footer}
    >
      <div className="p-4">
        <div>
          {stage.name === 'pick' || stage.name === 'error' ? (
            <>
              <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-muted">
                <li>{t('board.importStepCsv')}</li>
                <li>{t('board.importStepGeoJson')}</li>
                <li>{t('board.importStepKml')}</li>
              </ul>
              <a
                className={cn(hoverClass.link, 'mt-2 inline-block underline')}
                href={takeoutUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t('board.importTakeoutLink')}
              </a>
              {stage.name === 'error' ? (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {t(errorKey(stage.error), { limit: 500 })}
                </p>
              ) : null}
              <label
                htmlFor={inputId}
                data-testid="import-drop"
                className="mt-4 flex min-h-24 cursor-pointer items-center justify-center rounded-[8px] border border-dashed border-border px-3 text-center"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const file = event.dataTransfer.files[0]
                  if (file) void handleFile(file)
                }}
              >
                <input
                  id={inputId}
                  type="file"
                  accept=".csv,.json,.geojson,.kml,.kmz,.zip"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void handleFile(file)
                  }}
                />
                {t('board.importDrop')}
              </label>
            </>
          ) : null}

          {stage.name === 'locating' ? (
            <div className="py-6 text-center">
              <p role="status">
                {t('board.importLocating', {
                  done: stage.done,
                  total: stage.total,
                })}
              </p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => abortRef.current?.abort()}
              >
                {t('board.importCancel')}
              </Button>
            </div>
          ) : null}

          {stage.name === 'preview' || stage.name === 'importing' ? (
            <>
              <div>
                <p aria-hidden="true" className="mb-2 text-sm font-semibold">
                  {t('board.category')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <ChipGroup
                    label={t('board.category')}
                    options={(kinds ?? []).map((kind) => ({
                      value: kind.id,
                      label: kindLabel(t, kind),
                      mark: <CategoryDot kind={kind} />,
                    }))}
                    value={pick.home ? [] : effective}
                    max={kindLimits.perSpot}
                    maxHint={t('kinds.atMostTwo')}
                    onChange={(next) => {
                      const toggled = [...next, ...effective].find(
                        (id) => next.includes(id) !== effective.includes(id),
                      )
                      if (toggled)
                        setPick(
                          togglePick(pick, effective, kinds ?? [], toggled),
                        )
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
                    value={pick.home ? ['home'] : []}
                    onChange={(next) => {
                      if (next.includes('home'))
                        setPick({ home: true, kindIds: [] })
                    }}
                  />
                </div>
              </div>
              <ul className="m-0 mt-3 list-none space-y-2 p-0">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-[8px] border border-border p-2"
                  >
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={row.ticked}
                        disabled={row.locationStatus === 'not_found'}
                        onChange={() => toggle(row.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{row.title}</span>
                        <span className="block text-sm text-muted">
                          {row.address ?? row.foundLabel ?? ''}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                          <span>{t(statusKey(row))}</span>
                          {row.duplicate ? (
                            <span>{t('board.importDuplicate')}</span>
                          ) : null}
                          {row.shortened ? (
                            <span>{t('board.importShortened')}</span>
                          ) : null}
                        </span>
                      </span>
                    </label>
                    {row.locationStatus === 'not_found' ? (
                      <NotFoundSearch
                        tripId={tripId}
                        lang={lang}
                        onPick={(place) => pickPlace(row.id, place)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

function statusKey(row: PreviewRow): string {
  if (row.locationStatus === 'file') return 'board.importFromFile'
  if (row.locationStatus === 'found') return 'board.importFound'
  return 'board.importNotFound'
}

function errorKey(error: ParseError): string {
  switch (error) {
    case 'kmz':
      return 'board.importErrorKmz'
    case 'too_large':
      return 'board.importErrorTooLarge'
    case 'too_many_rows':
      return 'board.importErrorTooManyRows'
    case 'no_title_column':
      return 'board.importErrorNoTitleColumn'
    case 'unreadable':
      return 'board.importErrorUnreadable'
    case 'unsupported':
    default:
      return 'board.importErrorUnsupported'
  }
}

function NotFoundSearch({
  tripId,
  lang,
  onPick,
}: {
  tripId: string
  lang: GeocodeLang
  onPick: (place: { lat: number; lng: number; label: string }) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<
    { label: string; lat: number; lng: number }[]
  >([])

  useEffect(() => {
    if (query.trim().length < 2) {
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
  }, [lang, query, tripId])

  return (
    <div className="mt-2 pl-7">
      <input
        type="search"
        value={query}
        placeholder={t('board.importPickPlace')}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full min-h-11 rounded-[8px] border border-border bg-card px-3"
      />
      {results.length > 0 ? (
        <ul className="m-0 list-none p-0">
          {results.map((place) => (
            <li key={`${place.label}-${place.lat}-${place.lng}`}>
              <button
                type="button"
                className={cn(hoverClass.item, 'w-full px-3 py-2 text-left')}
                onClick={() => {
                  onPick(place)
                  setQuery('')
                  setResults([])
                }}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

type KindPick = { home: boolean; kindIds: string[] }

/** Home replaces the kinds; otherwise 1 or 2 kinds, kept in trip kind order. */
function togglePick(
  pick: KindPick,
  effective: string[],
  kinds: SpotKind[],
  id: string,
): KindPick {
  if (pick.home) return { home: false, kindIds: [id] }
  const wanted = effective.includes(id)
    ? effective.filter((item) => item !== id)
    : [...effective, id]
  if (wanted.length === 0) return { home: false, kindIds: effective }
  return {
    home: false,
    kindIds: kinds.filter((kind) => wanted.includes(kind.id)).map((k) => k.id),
  }
}
