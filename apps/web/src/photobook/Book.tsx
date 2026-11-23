import type { Photo } from '@tripboard/shared'
import { useTranslation } from 'react-i18next'
import { hoverClass } from '../components/ui/hover'
import { formatSize } from '../images/format'
import type { AppLocale } from '../lib/locale'
import { cn } from '../lib/utils'
import { formatDayLabel } from '../plan/plan-scene'
import { Collage } from './Collage'
import type { DayPage, PlaceGroup } from './groups'
import { formatPoint } from './time'

function PlaceLine({
  group,
  name,
}: {
  group: PlaceGroup
  name: string | null
}) {
  const { t } = useTranslation()
  const text = group.spotTitle
    ? group.spotTitle
    : group.lat === null || group.lng === null
      ? t('photobook.notPlaced')
      : name
        ? t('photobook.near', { place: name })
        : formatPoint(group.lat, group.lng)
  return (
    <h3 data-testid="book-place-line" className="m-0 text-sm font-medium">
      {text}
    </h3>
  )
}

/** The day pages: a collage per place group (R-47-06). */
export function Book({
  days,
  locale,
  rowHeight,
  highlightId,
  isShown,
  nameOf,
  labelOf,
  onOpen,
  onLoad,
}: {
  days: DayPage[]
  locale: AppLocale
  rowHeight: number
  highlightId: string | null
  isShown: (id: string) => boolean
  nameOf: (lat: number, lng: number) => string | null
  labelOf: (photo: Photo) => string
  onOpen: (photo: Photo) => void
  onLoad: (photos: Photo[]) => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <>
      {days.map((day) => {
        const held = day.places
          .flatMap((place) => place.photos)
          .filter((photo) => !isShown(photo.id))
        return (
          <section
            key={day.key}
            data-testid={`book-day-${day.key}`}
            aria-labelledby={`book-day-title-${day.key}`}
            className="space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id={`book-day-title-${day.key}`}
                className="m-0 text-lg font-semibold"
              >
                {day.date
                  ? formatDayLabel(day.date, locale)
                  : t('photobook.noDate')}
              </h2>
              {held.length > 1 ? (
                <button
                  type="button"
                  data-testid={`book-load-all-${day.key}`}
                  className={cn(
                    hoverClass.secondary,
                    'inline-flex min-h-11 items-center rounded-[8px] px-3 text-sm',
                  )}
                  onClick={() => onLoad(held)}
                >
                  {t('lowData.loadAll', {
                    size: formatSize(
                      held.reduce((sum, photo) => sum + photo.bytes, 0),
                      i18n.language,
                    ),
                  })}
                </button>
              ) : null}
            </div>
            {day.places.map((group) => (
              <div
                key={group.key}
                data-testid="book-place"
                className="space-y-1"
              >
                <PlaceLine
                  group={group}
                  name={
                    group.lat === null || group.lng === null
                      ? null
                      : nameOf(group.lat, group.lng)
                  }
                />
                <Collage
                  photos={group.photos}
                  rowHeight={rowHeight}
                  highlightId={highlightId}
                  isShown={isShown}
                  labelOf={labelOf}
                  onOpen={onOpen}
                  onLoad={(photo) => onLoad([photo])}
                />
              </div>
            ))}
          </section>
        )
      })}
    </>
  )
}
