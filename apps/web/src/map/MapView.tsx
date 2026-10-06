import { lazy, Suspense, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

const TripMap = lazy(() =>
  import('./TripMap').then((mod) => ({ default: mod.TripMap })),
)

export function MapView(props: ComponentProps<typeof TripMap>) {
  const { t } = useTranslation()
  return (
    <Suspense
      fallback={
        <div
          data-testid="map-loading"
          className="grid h-full min-h-40 place-items-center text-muted"
        >
          {t('board.map')}
        </div>
      }
    >
      <TripMap {...props} />
    </Suspense>
  )
}
