import type { Photo } from '@tripboard/shared'
import { photoLimits } from '@tripboard/shared'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Modal } from '../components/ui/modal'
import { imageSrc } from '../images/client'
import type { AppLocale } from '../lib/locale'
import { formatDateTime } from './time'

/** The photo at full size with time, place, uploader and caption (R-47-06). */
export function Lightbox({
  photo,
  place,
  locale,
  canEdit,
  busy,
  onClose,
  onSaveCaption,
  onDelete,
}: {
  photo: Photo
  /** The place line, or null for a photo that is not placed. */
  place: string | null
  locale: AppLocale
  canEdit: boolean
  busy: boolean
  onClose: () => void
  onSaveCaption: (caption: string | null) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(photo.caption ?? '')
  const dirty = useRef(false)
  // A caption saved by someone else shows up here unless this draft is being edited.
  useEffect(() => {
    if (!dirty.current) setDraft(photo.caption ?? '')
  }, [photo.caption])
  const changed = draft.trim() !== (photo.caption ?? '')
  return (
    <Modal
      title={t('photobook.lightboxTitle')}
      closeLabel={t('ui.close')}
      size="lg"
      layer="top"
      testId="photo-lightbox"
      onClose={onClose}
    >
      <figure className="m-0 flex flex-col gap-3 p-4">
        <img
          src={imageSrc(photo.url)}
          alt={photo.caption ?? t('photobook.lightboxTitle')}
          className="max-h-[60vh] w-full rounded-[8px] object-contain"
        />
        <dl className="m-0 grid gap-1 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">{t('photobook.time')}</dt>
            <dd className="m-0" data-testid="lightbox-time">
              {photo.takenAt
                ? formatDateTime(photo.takenAt, locale)
                : t('photobook.noDate')}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">{t('photobook.place')}</dt>
            <dd className="m-0" data-testid="lightbox-place">
              {place ?? t('photobook.notPlacedShort')}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">{t('photobook.uploader')}</dt>
            <dd className="m-0" data-testid="lightbox-uploader">
              {photo.uploadedBy?.name ?? t('photobook.uploaderGone')}
            </dd>
          </div>
        </dl>
        {photo.caption ? (
          <figcaption className="text-base" data-testid="lightbox-caption">
            {photo.caption}
          </figcaption>
        ) : null}
      </figure>
      {canEdit ? (
        <div className="flex flex-col gap-2 border-t border-border p-4">
          <label className="text-sm font-medium" htmlFor="photo-caption">
            {t('photobook.caption')}
          </label>
          <textarea
            id="photo-caption"
            data-testid="caption-input"
            value={draft}
            maxLength={photoLimits.caption}
            rows={2}
            className="min-h-11 w-full rounded-[8px] border border-border bg-card px-3 py-2"
            onChange={(event) => {
              dirty.current = true
              setDraft(event.target.value)
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="caption-save"
              disabled={busy || !changed}
              onClick={() => {
                dirty.current = false
                onSaveCaption(draft.trim() === '' ? null : draft.trim())
              }}
            >
              {t('photobook.captionSave')}
            </Button>
            <Button
              variant="danger"
              data-testid="lightbox-delete"
              disabled={busy}
              onClick={onDelete}
            >
              {t('photobook.delete')}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
