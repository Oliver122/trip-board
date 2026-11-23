import { defaultSpotListQuery } from '@tripboard/shared'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, Map as MapIcon } from 'lucide-react'
import { Outlet, useMatch, useParams, useSearchParams } from 'react-router'
import { usePhoneView } from '../components/phone/use-phone'
import { ErrorState, LoadingState } from '../components/states'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { MapView } from '../map/MapView'
import { mapLandColor } from '../map/style'
import { viewportStorageKey, type ViewportScope } from '../map/viewport'
import { useSession } from '../session'
import { useDark } from '../theme'
import { listSpots } from '../spots/client'
import { isAuth, isNotFound } from '../api/http'
import { getTrip } from '../trips/client'
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
        if (isAuth(error)) {
          reload()
          return
        }
        if (isNotFound(error)) {
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
  const photobook = useMatch('/trips/:id/photos')
  const settings = useMatch('/trips/:id/settings')
  const dark = useDark()
  const { phone, view, setView } = usePhoneView()
  // Below 640 px one view shows at a time; the map stays mounted behind (R-38-02).
  // The photobook opens as the book; `?view=map` shows the map (R-47-05).
  const [params, setParams] = useSearchParams()
  const photoMapShown =
    photobook != null &&
    (params.get('view') === 'map' || scene?.placing === true)
  const mapHidden =
    phone &&
    (photobook != null ? !photoMapShown : schedule != null || view === 'list')
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
        'relative flex min-h-0 flex-1 flex-col overflow-hidden',
        schedule || photobook ? 'lg:flex-row' : 'sm:flex-row',
      )}
    >
      <div
        className={cn(
          'relative min-h-0 min-w-0 flex-1',
          schedule || photobook ? 'order-2 min-h-[40vh]' : 'order-1',
          (settings || mapHidden) && 'invisible absolute inset-0 z-0 min-h-0',
        )}
        style={{ backgroundColor: land }}
        aria-hidden={settings || mapHidden ? true : undefined}
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
          plan={scene?.plan ?? null}
          onPlanStop={(linkId, date) =>
            handlersRef.current.onPlanStop?.(linkId, date)
          }
          onFocusDay={(date) => handlersRef.current.onFocusDay?.(date)}
          photos={scene?.photos ?? null}
          onPhoto={(id) => handlersRef.current.onPhoto?.(id)}
          onPhotoMove={(id, lng, lat) =>
            handlersRef.current.onPhotoMove?.(id, lng, lat)
          }
          onCancelLoad={() => setView('list', { replace: true })}
        />
        <div
          id="trip-map-overlay"
          className="pointer-events-none absolute inset-0 z-10"
        />
      </div>
      <div
        data-testid={settings ? 'settings-scroll' : undefined}
        className={cn(
          'flex min-h-0 min-w-0 flex-col',
          phone && photoMapShown && 'hidden',
          settings
            ? 'relative z-10 w-full flex-1 overflow-auto'
            : phone
              ? mapHidden
                ? 'relative z-10 w-full flex-1'
                : 'w-full'
              : schedule || photobook
                ? 'order-1 max-h-[50vh] w-full lg:max-h-none lg:w-[420px] lg:shrink-0'
                : 'order-2 w-full sm:w-[280px] sm:shrink-0 lg:w-[360px]',
        )}
      >
        <Outlet />
      </div>
      {phone && photobook ? (
        <button
          type="button"
          data-testid="photobook-view-toggle"
          className={cn(
            hoverClass.secondary,
            'fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold text-foreground shadow-panel',
          )}
          onClick={() =>
            setParams(
              (previous) => {
                const copy = new URLSearchParams(previous)
                if (params.get('view') === 'map') copy.delete('view')
                else copy.set('view', 'map')
                return copy
              },
              { replace: true },
            )
          }
        >
          {params.get('view') === 'map' ? (
            <ImageIcon aria-hidden="true" className="size-4" />
          ) : (
            <MapIcon aria-hidden="true" className="size-4" />
          )}
          {params.get('view') === 'map'
            ? t('photobook.toggleBook')
            : t('photobook.toggleMap')}
        </button>
      ) : null}
    </div>
  )
}
