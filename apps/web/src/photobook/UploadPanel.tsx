import { photoLimits, type Photo } from '@tripboard/shared'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/http'
import { ErrorNotice } from '../components/notice'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { getQuota, knownMaxFileBytes } from '../images/client'
import { formatSize } from '../images/format'
import { photoErrorMessage, tooLargeMessage } from '../images/reasons'
import { useMediaQuery, phoneQuery } from '../lib/media'
import { cn } from '../lib/utils'
import { buildPhotoForm, readPhotoMeta, type PhotoMeta } from './exif'
import { uploadPhoto } from './client'

export const locationsKey = 'photoLocations'

/** *Use photo locations*: kept per device, on by default (R-47-08). */
function readLocations(): boolean {
  try {
    return window.localStorage.getItem(locationsKey) !== '0'
  } catch {
    return true
  }
}

function storeLocations(value: boolean) {
  try {
    window.localStorage.setItem(locationsKey, value ? '1' : '0')
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
}

type Status = 'ready' | 'skipped' | 'uploading' | 'done' | 'failed'

type Item = {
  key: string
  file: File
  meta: PhotoMeta
  status: Status
  message: string | null
}

let nextKey = 0

const isImage = (file: File) =>
  file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)

/** The drop zone, the review list and the upload run (R-47-08). */
export function UploadPanel({
  tripId,
  enabled,
  onUploaded,
  onAuthLost,
}: {
  tripId: string
  /** False while uploads are paused (C-IMG-21). */
  enabled: boolean
  onUploaded: (photo: Photo) => void
  onAuthLost: () => void
}) {
  const { t, i18n } = useTranslation()
  const phone = useMediaQuery(phoneQuery)
  const input = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [reading, setReading] = useState(false)
  const [running, setRunning] = useState(false)
  const [ratio, setRatio] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [useLocations, setUseLocations] = useState(readLocations)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  function patch(key: string, change: Partial<Item>) {
    if (!mounted.current) return
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    )
  }

  async function take(dropped: File[]) {
    if (running || reading || dropped.length === 0) return
    let files = dropped
    let message: string | null = null
    if (files.length > photoLimits.batch) {
      files = files.slice(0, photoLimits.batch)
      message = t('photobook.tooMany', { max: photoLimits.batch })
    }
    setNotice(message)
    setReading(true)
    // A drop right after opening may come before the quota read.
    const limit = await getQuota().then(
      (quota) => quota.maxFileBytes,
      () => knownMaxFileBytes(),
    )
    const added = await Promise.all(
      files.map(async (file): Promise<Item> => {
        const key = `u${nextKey++}`
        if (!isImage(file)) {
          return {
            key,
            file,
            meta: { lat: null, lng: null, takenAt: null },
            status: 'skipped',
            message: t('images.errors.unsupported_type'),
          }
        }
        if (file.size > limit) {
          return {
            key,
            file,
            meta: { lat: null, lng: null, takenAt: null },
            status: 'skipped',
            message: tooLargeMessage(t, limit),
          }
        }
        return {
          key,
          file,
          meta: await readPhotoMeta(file),
          status: 'ready',
          message: null,
        }
      }),
    )
    if (!mounted.current) return
    setItems((current) =>
      [
        ...current.filter(
          (item) => item.status === 'ready' || item.status === 'skipped',
        ),
        ...added,
      ].slice(0, photoLimits.batch),
    )
    setReading(false)
  }

  async function start() {
    const queue = items.filter((item) => item.status === 'ready')
    if (queue.length === 0 || running) return
    setRunning(true)
    setNotice(null)
    let finished = 0
    for (const item of queue) {
      patch(item.key, { status: 'uploading', message: null })
      try {
        const saved = await uploadPhoto(
          tripId,
          buildPhotoForm(item.file, item.meta, useLocations),
          (part) => {
            if (mounted.current) setRatio((finished + part) / queue.length)
          },
        )
        finished += 1
        patch(item.key, { status: 'done' })
        onUploaded(saved)
      } catch (error) {
        finished += 1
        if (error instanceof ApiError && error.status === 401) {
          onAuthLost()
          break
        }
        const message = photoErrorMessage(error, t)
        // Paused uploads and a full quota fail every remaining file the same
        // way: stop, and leave this file ready for another try.
        if (
          error instanceof ApiError &&
          (error.status === 503 || error.code === 'quota_exceeded')
        ) {
          patch(item.key, { status: 'ready', message: null })
          if (mounted.current) setNotice(message)
          break
        }
        patch(item.key, { status: 'failed', message })
      }
      if (mounted.current) setRatio(finished / queue.length)
    }
    if (mounted.current) {
      setRunning(false)
      setRatio(0)
    }
  }

  const ready = items.filter((item) => item.status === 'ready')
  const withLocation = useLocations
    ? ready.filter((item) => item.meta.lat !== null).length
    : 0
  const skipped = items.filter((item) => item.status === 'skipped').length
  const label = (item: Item): string => {
    if (item.status === 'ready') {
      return useLocations && item.meta.lat !== null
        ? t('photobook.upload.located')
        : t('photobook.upload.unlocated')
    }
    if (item.status === 'uploading') return t('photobook.upload.uploading')
    if (item.status === 'done') return t('photobook.upload.done')
    return item.message ?? t('photobook.upload.failed')
  }

  if (!enabled) {
    return (
      <p data-testid="photo-drop" aria-disabled="true" className="text-sm">
        {t('board.uploadsPaused')}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <label
        data-testid="photo-drop"
        htmlFor="photo-file-input"
        tabIndex={0}
        className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-border px-3 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          input.current?.click()
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void take([...event.dataTransfer.files])
        }}
      >
        <input
          ref={input}
          id="photo-file-input"
          data-testid="photo-file-input"
          type="file"
          accept={
            phone
              ? 'image/*'
              : 'image/jpeg,image/png,image/webp,image/heic,.heic'
          }
          multiple
          tabIndex={-1}
          className="sr-only"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            void take(files)
          }}
        />
        <span>{t('photobook.dropLabel')}</span>
        <span className="text-xs text-muted">
          {t('photobook.dropHint', { max: photoLimits.batch })}
        </span>
      </label>
      {notice ? <ErrorNotice>{notice}</ErrorNotice> : null}
      {reading ? (
        <p role="status" className="text-sm text-muted">
          {t('photobook.upload.reading')}
        </p>
      ) : null}
      {items.length > 0 ? (
        <div
          data-testid="upload-review"
          className="space-y-3 rounded-card border border-border bg-card p-3"
        >
          <p className="m-0 font-medium" data-testid="upload-summary">
            {t('photobook.upload.summary', {
              withLocation,
              without: ready.length - withLocation,
            })}
            {skipped > 0
              ? t('photobook.upload.withSkipped', { count: skipped })
              : ''}
          </p>
          <Switch
            checked={useLocations}
            testId="photo-locations-switch"
            disabled={running}
            onChange={(next) => {
              setUseLocations(next)
              storeLocations(next)
            }}
          >
            {t('photobook.upload.useLocations')}
          </Switch>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {items.map((item) => (
              <li
                key={item.key}
                data-testid="upload-item"
                data-status={item.status}
                className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 border-b border-border py-1 last:border-b-0"
              >
                <span className="min-w-0 truncate">
                  {item.file.name}
                  <span className="text-muted">
                    {t('photobook.upload.fileSize', {
                      size: formatSize(item.file.size, i18n.language),
                    })}
                  </span>
                </span>
                <span
                  className={cn(
                    item.status === 'failed' || item.status === 'skipped'
                      ? 'text-danger'
                      : 'text-muted',
                  )}
                >
                  {label(item)}
                </span>
              </li>
            ))}
          </ul>
          {running ? (
            <progress
              data-testid="upload-progress"
              aria-label={t('board.uploadProgress')}
              value={Math.round(ratio * 100)}
              max={100}
              className="h-2 w-full"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="upload-start"
              disabled={running || ready.length === 0}
              onClick={() => void start()}
            >
              {t('photobook.upload.start')}
            </Button>
            <Button
              variant="outline"
              data-testid="upload-clear"
              disabled={running}
              onClick={() => {
                setItems([])
                setNotice(null)
              }}
            >
              {t('photobook.upload.clear')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
