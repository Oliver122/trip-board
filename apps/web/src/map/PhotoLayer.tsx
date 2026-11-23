import { Image as ImageIcon } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Marker } from 'react-map-gl/maplibre'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import type { PhotoMapScene } from '../trips/trip-context'
import type { LngLatBounds } from './bounds'
import { clusterPhotos } from './photo-clusters'

/** Photo markers and their clusters while the Photobook tab is active (R-47-07). */
export function PhotoLayer({
  photos,
  bounds,
  zoom,
  onPhoto,
  onPhotoMove,
  onZoomTo,
}: {
  photos: PhotoMapScene
  bounds: LngLatBounds
  zoom: number
  onPhoto: (id: string) => void
  onPhotoMove: (id: string, lng: number, lat: number) => void
  onZoomTo: (lng: number, lat: number) => void
}) {
  const { t } = useTranslation()
  const items = useMemo(
    () => clusterPhotos(photos.markers, bounds, zoom),
    [photos.markers, bounds, zoom],
  )
  // A drag ends with a click on the button; it must not count as a click.
  const dragged = useRef(false)

  return (
    <>
      {items.map((item) => {
        if (item.kind === 'cluster') {
          return (
            <Marker
              key={`photo-cluster-${item.id}`}
              longitude={item.lng}
              latitude={item.lat}
              anchor="center"
            >
              <button
                type="button"
                className={cn(
                  hoverClass.cluster,
                  'inline-flex size-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground shadow-panel',
                )}
                data-testid="photo-cluster"
                aria-label={t('photobook.cluster', { count: item.count })}
                onClick={() => onZoomTo(item.lng, item.lat)}
              >
                {item.count}
              </button>
            </Marker>
          )
        }
        const { photo } = item
        const highlighted = photo.id === photos.highlightId
        return (
          <Marker
            key={photo.id}
            longitude={photo.lng}
            latitude={photo.lat}
            anchor="center"
            draggable={photos.draggable}
            onDragStart={() => {
              dragged.current = true
            }}
            onDragEnd={(event) => {
              onPhotoMove(photo.id, event.lngLat.lng, event.lngLat.lat)
              setTimeout(() => {
                dragged.current = false
              }, 0)
            }}
            style={{ zIndex: highlighted ? 4 : 1 }}
          >
            <button
              type="button"
              data-testid={`photo-marker-${photo.id}`}
              data-highlighted={highlighted ? 'true' : 'false'}
              data-draggable={photos.draggable ? 'true' : 'false'}
              aria-label={photo.label}
              className={cn(
                'relative inline-flex size-10 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-card text-muted shadow-panel',
                photos.draggable ? hoverClass.grab : hoverClass.pin,
                highlighted && 'ring-4 ring-accent',
              )}
              onClick={() => {
                if (dragged.current) return
                onPhoto(photo.id)
              }}
            >
              {photo.src ? (
                <img
                  src={photo.src}
                  alt=""
                  draggable={false}
                  className="size-full object-cover"
                />
              ) : (
                <ImageIcon
                  aria-hidden="true"
                  data-icon="true"
                  className="size-5"
                />
              )}
            </button>
          </Marker>
        )
      })}
    </>
  )
}
