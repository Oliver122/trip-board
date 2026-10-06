import { LocateFixed, Minus, Plus } from 'lucide-react'
import { setWorkerUrl, type Map as MaplibreMap } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Map, { Marker, type MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Button } from '../components/ui/button'
import type { Category } from '../components/category'
import { activeLocale } from '../i18n'
import { useTheme, type ThemeChoice } from '../theme'
import { maxBoundsFor, toMaxBoundsTuple, type LngLatBounds } from './bounds'
import { clusterSpots, type MapSpot } from './clusters'
import { Pin } from './Pin'
import { mapStyle } from './style'
import { formatViewportHash, parseViewportHash } from './viewport'

setWorkerUrl(maplibreWorkerUrl)

type BoardWindow = Window & { __tripboardMap?: MaplibreMap }

const separator = ' · '

export function TripMap({
  bbox,
  spots,
  selectedId,
  hoverId,
  onSelect,
  onHover,
  placing = false,
  draft = null,
  onPlace,
  onDraftMove,
  onViewport,
}: {
  bbox: LngLatBounds
  spots: MapSpot[]
  selectedId: string | null
  hoverId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  placing?: boolean
  draft?: { lng: number; lat: number; category: Category } | null
  onPlace?: (lng: number, lat: number) => void
  onDraftMove?: (lng: number, lat: number) => void
  onViewport?: (bounds: LngLatBounds) => void
}) {
  const { t, i18n } = useTranslation()
  const { theme } = useTheme()
  const dark = useResolvedDark(theme)
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const mapRef = useRef<MapRef>(null)
  const [tileError, setTileError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [camera, setCamera] = useState({ bounds: bbox, zoom: 4 })
  const style = useMemo(
    () => mapStyle(locale, dark ? 'dark' : 'light'),
    [locale, dark],
  )
  const maxBounds = toMaxBoundsTuple(maxBoundsFor(bbox))
  const clustered = useMemo(
    () => clusterSpots(spots, camera.bounds, camera.zoom),
    [spots, camera],
  )
  const hash = parseViewportHash(window.location.hash)

  function remember(map: MaplibreMap) {
    const center = map.getCenter()
    const zoom = map.getZoom()
    const next = map.getBounds()
    setCamera({
      zoom,
      bounds: {
        minLng: next.getWest(),
        minLat: next.getSouth(),
        maxLng: next.getEast(),
        maxLat: next.getNorth(),
      },
    })
    onViewport?.({
      minLng: next.getWest(),
      minLat: next.getSouth(),
      maxLng: next.getEast(),
      maxLat: next.getNorth(),
    })
    const nextHash = formatViewportHash({
      lng: center.lng,
      lat: center.lat,
      zoom,
    })
    const url = `${window.location.pathname}${window.location.search}${nextHash}`
    if (window.location.hash !== nextHash) {
      window.history.replaceState(window.history.state, '', url)
    }
  }

  function withMap(run: (map: MaplibreMap) => void) {
    const map = mapRef.current?.getMap()
    if (map) run(map)
  }

  return (
    <div className="absolute inset-0" role="region" aria-label={t('board.map')}>
      <Map
        key={`${attempt}-${locale}-${dark ? 'dark' : 'light'}`}
        ref={mapRef}
        mapStyle={style}
        attributionControl={false}
        maxBounds={maxBounds}
        initialViewState={
          hash
            ? { longitude: hash.lng, latitude: hash.lat, zoom: hash.zoom }
            : {
                bounds: [
                  [bbox.minLng, bbox.minLat],
                  [bbox.maxLng, bbox.maxLat],
                ],
                fitBoundsOptions: { padding: 48 },
              }
        }
        style={{ width: '100%', height: '100%' }}
        onLoad={(event) => {
          const map = event.target
          ;(window as BoardWindow).__tripboardMap = map
          remember(map)
        }}
        onMoveEnd={(event) => {
          remember(event.target)
        }}
        onClick={(event) => {
          if (!placing || !onPlace) return
          const target = event.originalEvent.target
          if (target instanceof Element && target.closest('button')) return
          onPlace(event.lngLat.lng, event.lngLat.lat)
        }}
        onError={(event) => {
          if (isTileFailure(event.error)) setTileError(true)
        }}
      >
        {clustered.map((item) =>
          item.kind === 'cluster' ? (
            <Marker
              key={`cluster-${item.id}`}
              longitude={item.lng}
              latitude={item.lat}
              anchor="center"
            >
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground shadow-panel"
                data-testid="cluster"
                aria-label={t('board.cluster', { count: item.count })}
                onClick={() => {
                  withMap((map) => {
                    map.easeTo({
                      center: [item.lng, item.lat],
                      zoom: Math.min(map.getZoom() + 2, 16),
                    })
                  })
                }}
              >
                {item.count}
              </button>
            </Marker>
          ) : (
            <Marker
              key={item.spot.id}
              longitude={item.spot.lng}
              latitude={item.spot.lat}
              anchor="center"
              style={{
                zIndex:
                  item.spot.id === selectedId
                    ? 3
                    : item.spot.id === hoverId
                      ? 2
                      : 1,
              }}
            >
              <Pin
                category={item.spot.category}
                label={item.spot.title}
                selected={item.spot.id === selectedId}
                hover={item.spot.id === hoverId}
                testId={`pin-${item.spot.id}`}
                onClick={() => {
                  if (!placing) onSelect(item.spot.id)
                }}
                onMouseEnter={() => onHover(item.spot.id)}
                onMouseLeave={() => onHover(null)}
              />
            </Marker>
          ),
        )}
        {draft ? (
          <Marker
            longitude={draft.lng}
            latitude={draft.lat}
            anchor="center"
            draggable
            onDragEnd={(event) =>
              onDraftMove?.(event.lngLat.lng, event.lngLat.lat)
            }
          >
            <Pin
              category={draft.category}
              label={t('board.draftPin')}
              selected
              testId="draft-pin"
            />
          </Marker>
        ) : null}
      </Map>
      {tileError ? (
        <div
          role="status"
          data-testid="tile-error"
          className="absolute inset-x-4 top-4 z-10 flex items-center justify-between gap-3 rounded-card border border-border bg-card px-4 py-3 shadow-panel"
        >
          <p>{t('board.tileError')}</p>
          <Button
            variant="outline"
            onClick={() => {
              setTileError(false)
              setAttempt((value) => value + 1)
            }}
          >
            {t('state.retry')}
          </Button>
        </div>
      ) : null}
      <div className="absolute right-3 bottom-3 z-10 flex flex-col gap-1">
        <Button
          variant="outline"
          className="size-11 px-0"
          aria-label={t('board.zoomIn')}
          onClick={() => withMap((map) => map.zoomIn())}
        >
          <Plus aria-hidden="true" className="size-4" />
        </Button>
        <Button
          variant="outline"
          className="size-11 px-0"
          aria-label={t('board.zoomOut')}
          onClick={() => withMap((map) => map.zoomOut())}
        >
          <Minus aria-hidden="true" className="size-4" />
        </Button>
        <Button
          variant="outline"
          className="size-11 px-0"
          aria-label={t('board.locate')}
          onClick={() => {
            if (!navigator.geolocation) return
            navigator.geolocation.getCurrentPosition((position) => {
              withMap((map) => {
                map.easeTo({
                  center: [position.coords.longitude, position.coords.latitude],
                  zoom: Math.max(map.getZoom(), 12),
                })
              })
            })
          }}
        >
          <LocateFixed aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <p className="absolute bottom-2 left-3 z-10 m-0 rounded bg-card/90 px-1.5 py-0.5 text-[11px] text-muted">
        <a
          href="https://openfreemap.org/"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline"
        >
          {t('board.attributionOfm')}
        </a>
        {separator}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline"
        >
          {t('board.attributionOsm')}
        </a>
      </p>
    </div>
  )
}

function useResolvedDark(theme: ThemeChoice) {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    const sync = () => {
      setDark(document.documentElement.classList.contains('dark'))
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [theme])
  return dark
}

export function isTileFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as { message?: unknown; url?: unknown; status?: unknown }
  const message = typeof record.message === 'string' ? record.message : ''
  const url = typeof record.url === 'string' ? record.url : ''
  if (url.includes('openfreemap.org') || url.includes('.pbf')) return true
  if (typeof record.status === 'number' && record.status >= 400) return true
  return /failed to fetch|ajaxerror|network|load failed/i.test(message)
}
