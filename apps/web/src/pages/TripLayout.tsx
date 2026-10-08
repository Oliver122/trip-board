import { defaultSpotListQuery } from '@tripboard/shared'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useMatch, useParams } from 'react-router'
import { ErrorState, LoadingState } from '../components/states'
import { cn } from '../lib/utils'
import { MapView } from '../map/MapView'
import { mapLandColor } from '../map/style'
import { viewportStorageKey, type ViewportScope } from '../map/viewport'
import { useSession } from '../session'
import { useDark } from '../theme'
import { listSpots } from '../spots/client'
import { AuthError, getTrip, NotFoundError } from '../trips/client'
import { TripProvider, useTripData } from '../trips/trip-context'

export function TripLayout() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { reload } = useSession()
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'missing' | 'error'
  >('loading')
  const [loaded, setLoaded] = useState<{
    trip: Awaited<ReturnType<typeof getTrip>>
    spots: Awaited<ReturnType<typeof listSpots>>
  } | null>(null)

  useEffect(() => {
    if (!id) {
      setStatus('missing')
      return
    }
    const controller = new AbortController()
    setStatus('loading')
    setLoaded(null)
    void Promise.all([
      getTrip(id, controller.signal),
      listSpots(id, defaultSpotListQuery, controller.signal),
    ])
      .then(([trip, spotList]) => {
        setLoaded({ trip, spots: spotList })
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof AuthError) {
          reload()
          return
        }
        if (error instanceof NotFoundError) {
          setStatus('missing')
          return
        }
        setStatus('error')
      })
    return () => controller.abort()
  }, [attempt, id, reload])

  if (status === 'missing' || !id) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <ErrorState message={t('trips.notFound')} />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="mx-auto max-w-xl p-8">
        <ErrorState retry={() => setAttempt((value) => value + 1)} />
      </div>
    )
  }
  if (status !== 'ready' || !loaded) {
    return (
      <div className="p-8" data-testid="page-loading">
        <LoadingState />
      </div>
    )
  }

  return (
    <TripProvider
      key={loaded.trip.id}
      trip={loaded.trip}
      spots={loaded.spots.spots}
      total={loaded.spots.total}
    >
      <TripWorkspace />
    </TripProvider>
  )
}

function TripWorkspace() {
  const { t } = useTranslation()
  const { trip, scene, handlersRef, accessLost } = useTripData()
  const schedule = useMatch('/trips/:id/schedule')
  const settings = useMatch('/trips/:id/settings')
  const dark = useDark()
  const routeScope: ViewportScope | null = settings
    ? null
    : schedule
      ? 'schedule'
      : 'board'
  const heldScope = useRef<ViewportScope>(routeScope ?? 'board')
  if (routeScope) heldScope.current = routeScope
  const scope = heldScope.current
  const land = mapLandColor(dark ? 'dark' : 'light')
  const frame = scene?.focus ?? null

  if (accessLost) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <ErrorState message={t('trips.notFound')} />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 flex-col',
        schedule ? 'lg:flex-row' : 'sm:flex-row',
      )}
    >
      <div
        className={cn(
          'relative min-h-0 min-w-0 flex-1',
          schedule ? 'order-2 min-h-[40vh]' : 'order-1',
          settings && 'invisible absolute inset-0 z-0 min-h-0',
        )}
        style={{ backgroundColor: land }}
        aria-hidden={settings ? true : undefined}
      >
        <MapView
          key={trip.id}
          bbox={trip.region.bbox}
          spots={scene?.spots ?? []}
          selectedId={scene?.selectedId ?? null}
          hoverId={scene?.hoverId ?? null}
          placing={scene?.placing ?? false}
          draft={scene?.draft ?? null}
          highlightIds={scene?.highlightIds ?? []}
          focus={frame}
          onSelect={(id) => handlersRef.current.onSelect(id)}
          onHover={(id) => handlersRef.current.onHover(id)}
          onPlace={(lng, lat) => handlersRef.current.onPlace?.(lng, lat)}
          onContextPlace={(lng, lat) =>
            handlersRef.current.onContextPlace?.(lng, lat) ?? false
          }
          onDraftMove={(lng, lat) =>
            handlersRef.current.onDraftMove?.(lng, lat)
          }
          onViewport={(bounds) => handlersRef.current.onViewport?.(bounds)}
          viewportScope={scope}
          viewportStorageKey={viewportStorageKey('board', trip.id)}
          flyTo={scene?.flyTo ?? null}
        />
        <div
          id="trip-map-overlay"
          className="pointer-events-none absolute inset-0 z-10"
        />
      </div>
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-col',
          settings
            ? 'relative z-10 w-full flex-1 overflow-auto'
            : schedule
              ? 'order-1 max-h-[50vh] w-full lg:max-h-none lg:w-[420px] lg:shrink-0'
              : 'order-2 w-full sm:w-[280px] sm:shrink-0 lg:w-[360px]',
        )}
      >
        <Outlet />
      </div>
    </div>
  )
}
