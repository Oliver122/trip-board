import type { Photo } from '@tripboard/shared'
import { ImageIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hoverClass } from '../components/ui/hover'
import { imageSrc } from '../images/client'
import { formatSize } from '../images/format'
import { cn } from '../lib/utils'
import { layoutCollage } from './layout'

/** Width of an element, kept up to date; 640 px where there is no ResizeObserver (tests). */
function useWidth(ref: { current: HTMLElement | null }): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () =>
      setWidth(Math.floor(element.getBoundingClientRect().width))
    if (typeof ResizeObserver === 'undefined') {
      setWidth(element.clientWidth || 640)
      return
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/** One place's photos as a justified collage (R-47-06). */
export function Collage({
  photos,
  rowHeight,
  highlightId,
  isShown,
  labelOf,
  onOpen,
  onLoad,
}: {
  photos: Photo[]
  rowHeight: number
  highlightId: string | null
  isShown: (id: string) => boolean
  labelOf: (photo: Photo) => string
  onOpen: (photo: Photo) => void
  onLoad: (photo: Photo) => void
}) {
  const { t, i18n } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const rows = useMemo(
    () =>
      layoutCollage(
        photos.map((photo) => ({
          id: photo.id,
          ratio: photo.width / photo.height,
        })),
        width,
        rowHeight,
      ),
    [photos, rowHeight, width],
  )
  const byId = new Map(photos.map((photo) => [photo.id, photo]))
  return (
    <div ref={ref} className="flex flex-col gap-1">
      {rows.map((row) => (
        <div key={row.cells[0]?.id} className="flex gap-1">
          {row.cells.map((cell) => {
            const photo = byId.get(cell.id)
            if (!photo) return null
            const highlighted = highlightId === photo.id
            const ring = cn(
              'rounded-[8px] data-[highlighted=true]:outline data-[highlighted=true]:outline-2 data-[highlighted=true]:outline-offset-2 data-[highlighted=true]:outline-accent',
            )
            return (
              <div
                key={photo.id}
                id={`book-tile-${photo.id}`}
                className="relative shrink-0 scroll-mt-16"
                style={{ width: cell.width, height: cell.height }}
              >
                {isShown(photo.id) ? (
                  <button
                    type="button"
                    data-testid={`book-photo-${photo.id}`}
                    data-highlighted={highlighted ? 'true' : 'false'}
                    aria-label={labelOf(photo)}
                    className={cn(
                      hoverClass.card,
                      ring,
                      'block size-full overflow-hidden border border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
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
                    data-highlighted={highlighted ? 'true' : 'false'}
                    role="group"
                    aria-label={t('lowData.photoPlaceholder', {
                      size: formatSize(photo.bytes, i18n.language),
                    })}
                    className={cn(
                      ring,
                      'flex size-full flex-col items-center justify-center gap-0.5 border border-border bg-border/40 p-1 text-center text-xs',
                    )}
                  >
                    <ImageIcon
                      aria-hidden="true"
                      className="size-5 text-muted"
                    />
                    <span className="text-muted">
                      {formatSize(photo.bytes, i18n.language)}
                    </span>
                    <button
                      type="button"
                      className={cn(
                        hoverClass.secondary,
                        'inline-flex min-h-11 items-center rounded-[8px] px-2',
                      )}
                      onClick={() => onLoad(photo)}
                    >
                      {t('lowData.loadPhoto')}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
