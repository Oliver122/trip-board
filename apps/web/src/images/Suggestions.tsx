import type { PhotoSuggestion } from '@tripboard/shared'
import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hoverClass } from '../components/ui/hover'
import { useDataSaver } from '../lib/data-saver'
import { cn } from '../lib/utils'
import { listPhotoSuggestions } from './client'

type Load =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; items: PhotoSuggestion[] }

/** The collapsed *Suggested photos* strip with Wikimedia Commons photos near a point (R-34-10). */
export function Suggestions({
  tripId,
  lat,
  lng,
  defaultOpen = false,
  disabled = false,
  isAdded,
  busyTitle = null,
  onAdd,
}: {
  tripId: string
  lat: number
  lng: number
  defaultOpen?: boolean
  disabled?: boolean
  /** Files already on the spot or in the queue are left out. */
  isAdded: (suggestion: PhotoSuggestion) => boolean
  /** The file being added right now. */
  busyTitle?: string | null
  onAdd: (suggestion: PhotoSuggestion) => void
}) {
  const { t } = useTranslation()
  const panelId = useId()
  const { on: lowData } = useDataSaver()
  // Low data (R-38-10): never opened on its own; opens once low data is off.
  const [open, setOpen] = useState(defaultOpen && !lowData)
  const heldBack = useRef(defaultOpen && lowData)
  useEffect(() => {
    if (!lowData && heldBack.current) {
      heldBack.current = false
      setOpen(true)
    }
  }, [lowData])
  const [load, setLoad] = useState<Load>({ state: 'idle' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setLoad({ state: 'idle' })
  }, [tripId, lat, lng])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoad({ state: 'loading' })
    void listPhotoSuggestions(tripId, lat, lng, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setLoad({ state: 'ready', items })
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: 'error' })
      })
    return () => controller.abort()
  }, [open, tripId, lat, lng, attempt])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  const items =
    load.state === 'ready' ? load.items.filter((item) => !isAdded(item)) : []

  return (
    <div data-testid="photo-suggestions" className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          hoverClass.secondary,
          'inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-border px-3',
        )}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 transition-transform',
            open ? '' : '-rotate-90',
          )}
        />
        {t('images.suggestionsTitle')}
      </button>
      <div id={panelId} hidden={!open} className="space-y-2">
        {open && load.state === 'loading' ? (
          <div role="status" aria-label={t('images.suggestionsLoading')}>
            <ul aria-hidden="true" className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((index) => (
                <li
                  key={index}
                  className="aspect-[4/3] animate-pulse rounded-[8px] bg-border"
                />
              ))}
            </ul>
          </div>
        ) : null}
        {open && load.state === 'error' ? (
          <p className="text-sm">
            {t('images.suggestionsError')}{' '}
            <button
              type="button"
              className={cn(hoverClass.ghost, 'min-h-11 px-2 underline')}
              onClick={retry}
            >
              {t('images.suggestionsRetry')}
            </button>
          </p>
        ) : null}
        {open && load.state === 'ready' && items.length === 0 ? (
          <p className="text-sm text-muted">{t('images.suggestionsEmpty')}</p>
        ) : null}
        {open && items.length > 0 ? (
          <ul className="grid grid-cols-2 gap-2">
            {items.map((item) => (
              <li
                key={item.fileTitle}
                className="space-y-1 rounded-[8px] border border-border p-1"
              >
                <img
                  src={item.thumbUrl}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-[6px] object-cover"
                />
                <p className="px-1 text-xs break-words text-muted">
                  {t('images.suggestionsBy', {
                    artist: item.artist,
                    license: item.license,
                  })}
                </p>
                <button
                  type="button"
                  disabled={disabled || busyTitle !== null}
                  aria-label={t('images.suggestionsAddLabel', {
                    artist: item.artist,
                  })}
                  className={cn(
                    hoverClass.secondary,
                    'inline-flex min-h-11 w-full items-center justify-center rounded-[8px] border border-border px-3 disabled:opacity-60',
                  )}
                  onClick={() => onAdd(item)}
                >
                  {busyTitle === item.fileTitle
                    ? t('images.suggestionsAdding')
                    : t('images.suggestionsAdd')}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {open ? (
          <p className="text-xs text-muted">
            <a
              href="https://commons.wikimedia.org"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(hoverClass.link, 'underline')}
            >
              {t('images.suggestionsFooter')}
            </a>
          </p>
        ) : null}
      </div>
    </div>
  )
}
