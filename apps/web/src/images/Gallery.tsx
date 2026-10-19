import type { Quota, SpotImage } from '@tripboard/shared'
import { ImageIcon, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/http'
import { ErrorNotice } from '../components/notice'
import { hoverClass } from '../components/ui/hover'
import { useDataSaver } from '../lib/data-saver'
import { phoneQuery, useMediaQuery } from '../lib/media'
import { cn } from '../lib/utils'
import {
  addImageFromCommons,
  addImageFromUrl,
  deleteImage,
  getQuota,
  imageSrc,
  listImages,
  uploadImage,
} from './client'
import type { Dropped } from './drop'
import { DropZone, onPasteImage } from './DropZone'
import { formatSize, megabytes } from './format'
import { photoErrorMessage } from './reasons'
import { Suggestions } from './Suggestions'

/**
 * Photos shown or asked for while the page is open (R-38-08): they stay shown
 * when low data turns on. `previews` are local files of uploads made in low
 * data mode, shown without downloading the file again.
 */
const shownImages = new Set<string>()
const previews = new Map<string, string>()

export function Gallery({
  spotId,
  canEdit,
  revision = 0,
  tripId,
  title = '',
  address = '',
  lat,
  lng,
}: {
  spotId: string
  canEdit: boolean
  revision?: number
  /** Step 34: for *Find images on Google* and the suggestions (R-34-01, R-34-10). */
  tripId?: string
  title?: string
  address?: string
  lat?: number
  lng?: number
}) {
  const { t, i18n } = useTranslation()
  const { on: lowData } = useDataSaver()
  const phone = useMediaQuery(phoneQuery)
  const [, setShownRevision] = useState(0)
  const [images, setImages] = useState<SpotImage[]>([])
  const [quota, setQuota] = useState<Quota | null>(null)
  const [uploadsEnabled, setUploadsEnabled] = useState(true)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  /** 0..1 while uploading, -1 while the server downloads a link. */
  const [progress, setProgress] = useState<number | null>(null)
  const [busyTitle, setBusyTitle] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<SpotImage | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    void Promise.all([
      listImages(spotId, controller.signal),
      getQuota(controller.signal),
    ])
      .then(([list, nextQuota]) => {
        if (controller.signal.aborted) return
        setImages(list.images)
        setUploadsEnabled(list.uploadsEnabled)
        setQuota(nextQuota)
        setStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })
    return () => controller.abort()
  }, [revision, spotId])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setOpen(null)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open])

  // Without low data every image is on screen, and it stays when low data turns on.
  useEffect(() => {
    if (lowData) return
    for (const image of images) shownImages.add(image.id)
  }, [lowData, images])

  const isShown = (image: SpotImage) =>
    !lowData || shownImages.has(image.id) || previews.has(image.id)
  const sourceOf = (image: SpotImage) =>
    previews.get(image.id) ?? imageSrc(image.url)
  const held = images.filter((image) => !isShown(image))

  function show(list: readonly SpotImage[]) {
    for (const image of list) shownImages.add(image.id)
    setShownRevision((value) => value + 1)
  }

  const full =
    quota !== null &&
    (quota.usedImages >= quota.maxImages || quota.usedBytes >= quota.maxBytes)
  const blocked = !uploadsEnabled || full
  const blockMessage = !uploadsEnabled
    ? t('board.uploadsPaused')
    : t('board.imageLimit')

  async function refresh() {
    const [list, nextQuota] = await Promise.all([
      listImages(spotId),
      getQuota(),
    ])
    setImages(list.images)
    setUploadsEnabled(list.uploadsEnabled)
    setQuota(nextQuota)
  }

  async function run(work: () => Promise<void>) {
    setError(null)
    try {
      await work()
      await refresh()
    } catch (reason) {
      if (
        (reason instanceof Error && reason.message === 'paused') ||
        (reason instanceof ApiError && reason.status === 503)
      ) {
        setUploadsEnabled(false)
      }
      setError(photoErrorMessage(reason, t))
    } finally {
      setProgress(null)
      setBusyTitle(null)
    }
  }

  async function handleDropped(dropped: Dropped) {
    if (!canEdit || blocked || progress !== null || busyTitle !== null) return
    if (dropped.kind === 'none') {
      setError(t('images.webNotAnImage'))
      return
    }
    if (dropped.kind === 'files') {
      const files = dropped.files
      setProgress(0)
      await run(async () => {
        for (const file of files) {
          const saved = await uploadImage(spotId, file, setProgress)
          if (lowData && /^image\/(jpeg|png|webp)$/.test(file.type)) {
            previews.set(saved.id, URL.createObjectURL(file))
          }
        }
      })
      return
    }
    const url = dropped.url
    setProgress(-1)
    await run(async () => {
      await addImageFromUrl(spotId, url)
    })
  }

  async function addSuggestion(fileTitle: string) {
    if (!canEdit || blocked || progress !== null || busyTitle !== null) return
    setBusyTitle(fileTitle)
    await run(async () => {
      await addImageFromCommons(spotId, fileTitle)
    })
  }

  async function remove(imageId: string) {
    const snapshot = images
    setImages((current) => current.filter((image) => image.id !== imageId))
    try {
      await deleteImage(imageId)
      setQuota(await getQuota())
    } catch {
      setImages(snapshot)
      setError(t('board.imageError'))
    }
  }

  return (
    <section
      className="space-y-3"
      aria-label={t('board.photo')}
      onPaste={
        canEdit && status === 'ready'
          ? onPasteImage((dropped) => void handleDropped(dropped))
          : undefined
      }
    >
      {status === 'loading' ? <p>{t('board.imagesLoading')}</p> : null}
      {status === 'error' ? (
        <ErrorNotice>{t('board.imageError')}</ErrorNotice>
      ) : null}
      {quota ? (
        <p data-testid="quota-counter">
          {t('board.quota', {
            used: quota.usedImages,
            max: quota.maxImages,
            usedMb: megabytes(quota.usedBytes),
            maxMb: megabytes(quota.maxBytes),
          })}
        </p>
      ) : null}
      {canEdit && status === 'ready' ? (
        blocked ? (
          <p data-testid="image-drop" aria-disabled="true">
            {blockMessage}
          </p>
        ) : (
          <DropZone onDropped={(dropped) => void handleDropped(dropped)} />
        )
      ) : null}
      {canEdit && !phone && title.trim() !== '' ? (
        <a
          href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${title} ${address}`.trim())}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            hoverClass.link,
            'inline-flex min-h-11 items-center text-sm underline',
          )}
        >
          {t('images.webFindOnGoogle')}
        </a>
      ) : null}
      {canEdit &&
      status === 'ready' &&
      tripId !== undefined &&
      lat !== undefined &&
      lng !== undefined ? (
        <Suggestions
          tripId={tripId}
          lat={lat}
          lng={lng}
          disabled={blocked || progress !== null}
          busyTitle={busyTitle}
          isAdded={(item) =>
            images.some((image) => image.sourceUrl === item.descriptionUrl)
          }
          onAdd={(item) => void addSuggestion(item.fileTitle)}
        />
      ) : null}
      {progress !== null ? (
        <progress
          aria-label={t('board.uploadProgress')}
          value={progress < 0 ? undefined : Math.round(progress * 100)}
          max={100}
          className="h-2 w-full"
        />
      ) : null}
      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      {status === 'ready' && images.length === 0 ? (
        <p className="text-sm text-muted">{t('board.imagesEmpty')}</p>
      ) : null}
      {held.length > 1 ? (
        <button
          type="button"
          data-testid="load-all-photos"
          className={cn(
            hoverClass.secondary,
            'inline-flex min-h-11 items-center rounded-[8px] px-3 text-sm',
          )}
          onClick={() => show(held)}
        >
          {t('lowData.loadAll', {
            size: formatSize(
              held.reduce((sum, image) => sum + image.bytes, 0),
              i18n.language,
            ),
          })}
        </button>
      ) : null}
      {images.length > 0 ? (
        <ul className="grid grid-cols-3 items-start gap-2">
          {images.map((image) => (
            <li key={image.id} className="relative">
              {isShown(image) ? (
                <button
                  type="button"
                  className={cn(
                    hoverClass.card,
                    'block w-full overflow-hidden rounded-[8px] border border-transparent',
                  )}
                  aria-label={t('board.photo')}
                  onClick={() => setOpen(image)}
                >
                  <img
                    src={sourceOf(image)}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                </button>
              ) : (
                <PhotoPlaceholder
                  image={image}
                  language={i18n.language}
                  onLoad={() => show([image])}
                />
              )}
              {canEdit ? (
                <button
                  type="button"
                  aria-label={t('board.deleteImage')}
                  className={cn(
                    hoverClass.danger,
                    'absolute top-1 right-1 inline-flex size-8 items-center justify-center rounded-[8px] bg-card',
                  )}
                  onClick={() => {
                    void remove(image.id)
                  }}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <div
          data-testid="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t('board.photo')}
          className="absolute inset-0 z-10 flex items-center justify-center bg-foreground/80 p-4"
        >
          <button
            type="button"
            aria-label={t('board.close')}
            className={cn(
              hoverClass.ghost,
              'absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-[8px] bg-card',
            )}
            onClick={() => setOpen(null)}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
          <figure className="flex max-h-full max-w-full flex-col items-center gap-2">
            <img
              src={sourceOf(open)}
              alt={t('board.photo')}
              className="min-h-0 max-w-full object-contain"
            />
            <ImageSource image={open} />
          </figure>
        </div>
      ) : null}
    </section>
  )
}

/** A photo held back by low data: its shape, size and a button to load it (R-38-08). */
function PhotoPlaceholder({
  image,
  language,
  onLoad,
}: {
  image: SpotImage
  language: string
  onLoad: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      data-testid="photo-placeholder"
      role="group"
      aria-label={t('lowData.photoPlaceholder', {
        size: formatSize(image.bytes, language),
      })}
      style={{ aspectRatio: `${image.width} / ${image.height}` }}
      className="flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-[8px] border border-border bg-border/40 p-1 text-center text-xs"
    >
      <ImageIcon aria-hidden="true" className="size-5 text-muted" />
      <span className="text-muted">{formatSize(image.bytes, language)}</span>
      <button
        type="button"
        className={cn(
          hoverClass.secondary,
          'inline-flex min-h-11 items-center rounded-[8px] px-2',
        )}
        onClick={onLoad}
      >
        {t('lowData.loadPhoto')}
      </button>
    </div>
  )
}

/** Where a photo came from: a Commons credit or the host of a link (R-34-11). */
function ImageSource({ image }: { image: SpotImage }) {
  const { t } = useTranslation()
  if (!image.sourceUrl) return null
  const text =
    image.credit !== null
      ? t('images.webCredit', {
          artist: image.credit,
          license: image.license ?? '',
        })
      : t('images.webSource', { host: hostOf(image.sourceUrl) })
  return (
    <figcaption className="rounded-[8px] bg-card px-3 py-1 text-sm">
      <a
        href={image.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(hoverClass.link, 'underline')}
      >
        {text}
      </a>
    </figcaption>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
