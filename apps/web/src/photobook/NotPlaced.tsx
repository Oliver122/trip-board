import type { Photo } from '@tripboard/shared'
import { ImageIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { hoverClass } from '../components/ui/hover'
import { imageSrc } from '../images/client'
import { formatSize } from '../images/format'
import { cn } from '../lib/utils'

/** *Not placed yet*: photos with no point and no spot (R-47-09). */
export function NotPlaced({
  photos,
  canEdit,
  placingId,
  isShown,
  onOpen,
  onLoad,
  onPlace,
  onPick,
}: {
  photos: Photo[]
  canEdit: boolean
  placingId: string | null
  isShown: (id: string) => boolean
  onOpen: (photo: Photo) => void
  onLoad: (photo: Photo) => void
  onPlace: (photo: Photo) => void
  onPick: (photo: Photo) => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <section
      data-testid="not-placed"
      aria-labelledby="not-placed-title"
      className="space-y-2"
    >
      <h2 id="not-placed-title" className="text-lg font-semibold">
        {t('photobook.notPlaced')}
      </h2>
      <p className="text-sm text-muted">{t('photobook.notPlacedHint')}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {photos.map((photo) => (
          <li
            key={photo.id}
            id={`not-placed-item-${photo.id}`}
            data-testid={`not-placed-${photo.id}`}
            className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-2"
          >
            {isShown(photo.id) ? (
              <button
                type="button"
                data-testid={`not-placed-open-${photo.id}`}
                aria-label={t('photobook.openPhoto')}
                className={cn(
                  hoverClass.card,
                  'size-20 shrink-0 overflow-hidden rounded-[8px] border border-transparent',
                )}
                onClick={() => onOpen(photo)}
              >
                <img
                  src={imageSrc(photo.url)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              </button>
            ) : (
              <div
                data-testid="photo-placeholder"
                role="group"
                aria-label={t('lowData.photoPlaceholder', {
                  size: formatSize(photo.bytes, i18n.language),
                })}
                className="flex size-20 shrink-0 flex-col items-center justify-center rounded-[8px] border border-border bg-border/40 text-center text-xs"
              >
                <ImageIcon aria-hidden="true" className="size-4 text-muted" />
                <button
                  type="button"
                  className={cn(
                    hoverClass.secondary,
                    'inline-flex min-h-11 items-center rounded-[8px] px-1',
                  )}
                  onClick={() => onLoad(photo)}
                >
                  {t('lowData.loadPhoto')}
                </button>
              </div>
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="m-0 truncate">
                {photo.caption ?? photo.uploadedBy?.name ?? ''}
              </p>
            </div>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  data-testid={`place-on-map-${photo.id}`}
                  aria-pressed={placingId === photo.id}
                  onClick={() => onPlace(photo)}
                >
                  {t('photobook.placeOnMap')}
                </Button>
                <Button
                  variant="outline"
                  data-testid={`pick-spot-${photo.id}`}
                  onClick={() => onPick(photo)}
                >
                  {t('photobook.pickSpot')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
