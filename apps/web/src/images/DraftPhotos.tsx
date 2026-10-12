// The Photos section of the add panel (R-34-12): the same drops, pastes and
// suggestions as the gallery, but picked photos wait in a queue until the spot
// exists.
import { webImageLimits, type PhotoSuggestion } from '@tripboard/shared'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorNotice } from '../components/notice'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import type { Dropped } from './drop'
import { DropZone, onPasteImage } from './DropZone'
import type { QueuedPhoto } from './queue'
import { Suggestions } from './Suggestions'

export type DraftPhotosProps = {
  tripId: string
  /** The draft pin. */
  lat: number
  lng: number
  photos: QueuedPhoto[]
  onChange: (photos: QueuedPhoto[]) => void
  /** True when the draft was filled from a Google Maps link: open and load the suggestions at once. */
  autoOpenSuggestions: boolean
  disabled?: boolean
}

let counter = 0
function nextId(): string {
  counter += 1
  return `queued-${Date.now().toString(36)}-${counter}`
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function DraftPhotos({
  tripId,
  lat,
  lng,
  photos,
  onChange,
  autoOpenSuggestions,
  disabled = false,
}: DraftPhotosProps) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const full = photos.length >= webImageLimits.queued

  function add(next: QueuedPhoto[]) {
    const room = webImageLimits.queued - photos.length
    if (next.length > room)
      setError(t('images.queueFull', { max: webImageLimits.queued }))
    else setError(null)
    if (room > 0 && next.length > 0)
      onChange([...photos, ...next.slice(0, room)])
  }

  function handleDropped(dropped: Dropped) {
    if (disabled) return
    if (dropped.kind === 'none') {
      setError(t('images.webNotAnImage'))
      return
    }
    if (full) {
      setError(t('images.queueFull', { max: webImageLimits.queued }))
      return
    }
    if (dropped.kind === 'files') {
      add(
        dropped.files.map((file) => ({
          id: nextId(),
          kind: 'file',
          file,
          preview: URL.createObjectURL(file),
          label: file.name,
        })),
      )
      return
    }
    if (
      photos.some((photo) => photo.kind === 'url' && photo.url === dropped.url)
    ) {
      setError(null)
      return
    }
    add([
      {
        id: nextId(),
        kind: 'url',
        url: dropped.url,
        preview: dropped.url,
        label: hostOf(dropped.url),
      },
    ])
  }

  function addSuggestion(item: PhotoSuggestion) {
    if (disabled) return
    if (full) {
      setError(t('images.queueFull', { max: webImageLimits.queued }))
      return
    }
    add([
      {
        id: nextId(),
        kind: 'commons',
        fileTitle: item.fileTitle,
        preview: item.thumbUrl,
        label: item.artist || item.fileTitle,
      },
    ])
  }

  function remove(photo: QueuedPhoto) {
    if (photo.kind === 'file') URL.revokeObjectURL(photo.preview)
    setError(null)
    onChange(photos.filter((entry) => entry.id !== photo.id))
  }

  return (
    <section
      data-testid="draft-photos"
      className="space-y-3"
      aria-label={t('images.draftTitle')}
      onPaste={disabled ? undefined : onPasteImage(handleDropped)}
    >
      <h3 className="text-sm font-medium">{t('images.draftTitle')}</h3>
      <DropZone
        testId="draft-image-drop"
        disabled={disabled || full}
        onDropped={handleDropped}
      />
      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      {photos.length > 0 ? (
        <ul data-testid="queued-photos" className="grid grid-cols-4 gap-2">
          {photos.map((photo) => (
            <li key={photo.id} className="relative">
              <img
                src={photo.preview}
                alt={photo.label}
                className="aspect-square w-full rounded-[8px] object-cover"
              />
              <button
                type="button"
                disabled={disabled}
                aria-label={t('images.queueRemove', { label: photo.label })}
                className={cn(
                  hoverClass.danger,
                  'absolute top-1 right-1 inline-flex size-8 items-center justify-center rounded-[8px] bg-card',
                )}
                onClick={() => remove(photo)}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Suggestions
        tripId={tripId}
        lat={lat}
        lng={lng}
        defaultOpen={autoOpenSuggestions}
        disabled={disabled || full}
        isAdded={(item) =>
          photos.some(
            (photo) =>
              photo.kind === 'commons' && photo.fileTitle === item.fileTitle,
          )
        }
        onAdd={addSuggestion}
      />
    </section>
  )
}
