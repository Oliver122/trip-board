import type { Quota, SpotImage } from '@tripboard/shared'
import { X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  deleteImage,
  getQuota,
  imageSrc,
  listImages,
  uploadImage,
} from './client'
import { megabytes } from './format'

export function Gallery({
  spotId,
  canEdit,
  revision = 0,
}: {
  spotId: string
  canEdit: boolean
  revision?: number
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const [images, setImages] = useState<SpotImage[]>([])
  const [quota, setQuota] = useState<Quota | null>(null)
  const [uploadsEnabled, setUploadsEnabled] = useState(true)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [progress, setProgress] = useState<number | null>(null)
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

  const full =
    quota !== null &&
    (quota.usedImages >= quota.maxImages || quota.usedBytes >= quota.maxBytes)
  const blocked = !uploadsEnabled || full
  const blockMessage = !uploadsEnabled
    ? t('board.uploadsPaused')
    : t('board.imageLimit')

  async function addFiles(files: File[]) {
    if (!canEdit || blocked || files.length === 0) return
    setError(null)
    setProgress(0)
    try {
      for (const file of files) {
        await uploadImage(spotId, file, setProgress)
      }
      const [list, nextQuota] = await Promise.all([
        listImages(spotId),
        getQuota(),
      ])
      setImages(list.images)
      setUploadsEnabled(list.uploadsEnabled)
      setQuota(nextQuota)
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : ''
      if (code === 'paused') {
        setUploadsEnabled(false)
        setError(t('board.uploadsPaused'))
      } else if (code === 'quota') {
        setError(t('board.imageLimit'))
      } else {
        setError(t('board.imageError'))
      }
    } finally {
      setProgress(null)
    }
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
    <section className="space-y-3" aria-label={t('board.photo')}>
      {status === 'loading' ? <p>{t('board.imagesLoading')}</p> : null}
      {status === 'error' ? <p role="alert">{t('board.imageError')}</p> : null}
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
          <label
            data-testid="image-drop"
            className="flex min-h-24 cursor-pointer items-center justify-center rounded-[8px] border border-dashed border-border px-3 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              void addFiles([...event.dataTransfer.files])
            }}
          >
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,.heic"
              multiple
              className="sr-only"
              onChange={(event) => {
                const files = [...(event.target.files ?? [])]
                event.target.value = ''
                void addFiles(files)
              }}
            />
            {t('board.dropImages')}
          </label>
        )
      ) : null}
      {progress !== null ? (
        <progress
          aria-label={t('board.uploadProgress')}
          value={Math.round(progress * 100)}
          max={100}
          className="h-2 w-full"
        />
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {status === 'ready' && images.length === 0 ? (
        <p className="text-sm text-muted">{t('board.imagesEmpty')}</p>
      ) : null}
      {images.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {images.map((image) => (
            <li key={image.id} className="relative">
              <button
                type="button"
                className="block w-full overflow-hidden rounded-[8px]"
                aria-label={t('board.photo')}
                onClick={() => setOpen(image)}
              >
                <img
                  src={imageSrc(image.url)}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              </button>
              {canEdit ? (
                <button
                  type="button"
                  aria-label={t('board.deleteImage')}
                  className="absolute top-1 right-1 inline-flex size-8 items-center justify-center rounded-[8px] bg-card"
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
            className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-[8px] bg-card"
            onClick={() => setOpen(null)}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
          <img
            src={imageSrc(open.url)}
            alt={t('board.photo')}
            className="max-h-full max-w-full"
          />
        </div>
      ) : null}
    </section>
  )
}
