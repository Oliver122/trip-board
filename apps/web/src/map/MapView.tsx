import { lazy, Suspense, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { phoneQuery, useMediaQuery } from '../lib/media'
import { useMapGate } from './map-gate'

const TripMap = lazy(() =>
  import('./TripMap').then((mod) => ({ default: mod.TripMap })),
)

export function MapView({
  onCancelLoad,
  ...props
}: ComponentProps<typeof TripMap> & {
  /**
   * Step 38 (R-38-09): on the phone with low data on, *Cancel* in the
   * “Load the map?” confirm calls this (w3 switches back to *List*).
   */
  onCancelLoad?: () => void
}) {
  const { t } = useTranslation()
  const gate = useMapGate()
  const phone = useMediaQuery(phoneQuery)
  if (!gate.ready) {
    return (
      <div
        data-testid="map-gate"
        className="grid h-full min-h-40 place-items-center bg-card p-6 text-center"
      >
        <div className="space-y-3">
          <p>{t('lowData.loadMapQuestion')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button data-testid="load-map" onClick={gate.load}>
              {t('lowData.loadMap')}
            </Button>
            {phone ? (
              <Button variant="outline" onClick={onCancelLoad}>
                {t('lowData.cancel')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }
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
