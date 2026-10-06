import { LocateFixed, Minus, Plus } from 'lucide-react'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { setWorkerUrl, type Map as MaplibreMap } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Map, { Marker, type MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Button } from '../components/ui/button'
import type { Category } from '../components/category'
import { activeLocale } from '../i18n'
import { useDark } from '../theme'
import { maxBoundsFor, toMaxBoundsTuple, type LngLatBounds } from './bounds'
import { clusterSpots, type MapSpot } from './clusters'
import { Pin } from './Pin'
import { mapLandColor, mapStyle } from './style'
import {
  initialViewport,
  readStoredViewport,
  rememberViewport,
  viewportTransitionDuration,
  writeStoredViewport,
  type ViewportScope,
} from './viewport'

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
  highlightIds = [],
  focus = null,
  viewportScope = 'board',
  viewportStorageKey,
  flyTo = null,
}: {
  bbox: LngLatBounds
  spots: MapSpot[]
  selectedId: string | null
  hoverId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  placing?: boolean
  draft?: {
    lng: number
    lat: number
    category: Category
    filled?: boolean
  } | null
  onPlace?: (lng: number, lat: number) => void
  onDraftMove?: (lng: number, lat: number) => void
  onViewport?: (bounds: LngLatBounds) => void
  highlightIds?: string[]
  focus?: { key: string; bounds: LngLatBounds } | null
  viewportScope?: ViewportScope
  viewportStorageKey?: string
  flyTo?: { token: string; lng: number; lat: number } | null
}) {
  const { t, i18n } = useTranslation()
  const dark = useDark()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const mapRef = useRef<MapRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tileError, setTileError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
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
  const [initialView] = useState(() =>
    initialViewport(
      window.location.hash,
      viewportScope,
      viewportStorageKey ? readStoredViewport(viewportStorageKey) : null,
    ),
  )
  const focusRef = useRef(focus)
  focusRef.current = focus
  const flyRef = useRef(flyTo)
  flyRef.current = flyTo
  const bboxRef = useRef(bbox)
  bboxRef.current = bbox
  const scopeRef = useRef(viewportScope)
  scopeRef.current = viewportScope
  const storageKeyRef = useRef(viewportStorageKey)
  storageKeyRef.current = viewportStorageKey
  const onViewportRef = useRef(onViewport)
  onViewportRef.current = onViewport
  const flown = useRef<string | null>(null)
  const alive = useRef(true)
  const openingScope = useRef(viewportScope)
  const heldScope = useRef(viewportScope)
  const appliedFocus = useRef<string | null>(null)
  const gestureScope = useRef<ViewportScope | null>(null)
  const transitionToken = useRef(0)
  const suppressMove = useRef(false)
  const land = mapLandColor(dark ? 'dark' : 'light')

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      const boardWindow = window as BoardWindow
      if (boardWindow.__tripboardMap) delete boardWindow.__tripboardMap
    }
  }, [])

  useEffect(() => {
    const element = containerRef.current
    const map = mapRef.current?.getMap()
    if (!loaded || !element || !map) return
    const observer = new ResizeObserver(() => {
      map.resize()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [loaded])

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (map) flyToSpot(map)
  }, [flyTo])

  useLayoutEffect(() => {
    if (!loaded) return
    const map = mapRef.current?.getMap()
    if (!map) return
    const nextScope = viewportScope
    const previous = heldScope.current
    heldScope.current = nextScope
    if (previous !== nextScope) {
      animateTo(map, nextScope)
      return
    }
    if (nextScope === 'schedule') {
      const frame = focusRef.current
      if (frame && appliedFocus.current !== frame.key) {
        appliedFocus.current = frame.key
        fitBox(map, frame.bounds, 0, 80, 13)
      }
    }
  }, [loaded, viewportScope, focus])

  function flyToSpot(map: MaplibreMap) {
    const target = flyRef.current
    if (!target || flown.current === target.token) return
    flown.current = target.token
    map.easeTo({
      center: [target.lng, target.lat],
      zoom: Math.max(map.getZoom(), 12),
    })
  }

  function animateTo(map: MaplibreMap, scope: ViewportScope) {
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const duration = viewportTransitionDuration(reduced)
    const token = ++transitionToken.current
    gestureScope.current = null
    suppressMove.current = true
    map.stop()
    suppressMove.current = false
    const finish = () => {
      if (transitionToken.current !== token) return
      transitionToken.current = 0
      if (scopeRef.current !== scope) return
      commitViewport(map, scope)
    }
    map.once('moveend', finish)
    if (scope === 'board') {
      const stored = storageKeyRef.current
        ? readStoredViewport(storageKeyRef.current)
        : null
      if (stored) {
        map.easeTo({
          center: [stored.lng, stored.lat],
          zoom: stored.zoom,
          duration,
        })
      } else {
        fitBox(map, bboxRef.current, duration, 48)
      }
    } else {
      const frame = focusRef.current
      if (frame) {
        appliedFocus.current = frame.key
        fitBox(map, frame.bounds, duration, 80, 13)
      } else {
        appliedFocus.current = null
        fitBox(map, bboxRef.current, duration, 48)
      }
    }
    if (duration === 0) finish()
  }

  function commitViewport(map: MaplibreMap, eventScope: ViewportScope) {
    if (!alive.current) return
    const center = map.getCenter()
    const zoom = map.getZoom()
    const next = map.getBounds()
    const bounds = {
      minLng: next.getWest(),
      minLat: next.getSouth(),
      maxLng: next.getEast(),
      maxLat: next.getNorth(),
    }
    setCamera({ zoom, bounds })
    const decision = rememberViewport({
      eventScope,
      activeScope: scopeRef.current,
      view: { lng: center.lng, lat: center.lat, zoom },
      pathname: window.location.pathname,
      search: window.location.search,
    })
    if (!decision) return
    onViewportRef.current?.(bounds)
    if (decision.persistBoard && storageKeyRef.current) {
      writeStoredViewport(storageKeyRef.current, decision.view)
    }
    if (window.location.hash !== decision.hash) {
      const url = decision.url
      window.history.replaceState(window.history.state, '', url)
    }
  }

  function withMap(run: (map: MaplibreMap) => void) {
    const map = mapRef.current?.getMap()
    if (map) run(map)
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ backgroundColor: land }}
      role="region"
      aria-label={t('board.map')}
    >
      <Map
        key={`${attempt}-${locale}-${dark ? 'dark' : 'light'}`}
        ref={mapRef}
        mapStyle={style}
        attributionControl={false}
        maxBounds={maxBounds}
        initialViewState={
          initialView
            ? {
                longitude: initialView.lng,
                latitude: initialView.lat,
                zoom: initialView.zoom,
              }
            : {
                bounds: [
                  [bbox.minLng, bbox.minLat],
                  [bbox.maxLng, bbox.maxLat],
                ],
                fitBoundsOptions: { padding: 48 },
              }
        }
        style={{ width: '100%', height: '100%', background: land }}
        onLoad={(event) => {
          const map = event.target
          ;(window as BoardWindow).__tripboardMap = map
          setLoaded(true)
          if (scopeRef.current === openingScope.current) {
            commitViewport(map, scopeRef.current)
          }
          flyToSpot(map)
        }}
        onMoveStart={(event) => {
          if (event.originalEvent) gestureScope.current = scopeRef.current
        }}
        onMoveEnd={(event) => {
          if (suppressMove.current) return
          if (transitionToken.current !== 0) return
          const eventScope = gestureScope.current ?? scopeRef.current
          gestureScope.current = null
          commitViewport(event.target, eventScope)
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
                className={cn(
                  hoverClass.cluster,
                  'inline-flex size-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground shadow-panel',
                )}
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
                  item.spot.id === selectedId ||
                  highlightIds.includes(item.spot.id)
                    ? 3
                    : item.spot.id === hoverId
                      ? 2
                      : 1,
              }}
            >
              <Pin
                category={item.spot.category}
                filled={item.spot.category === 'home' && item.spot.primary}
                label={item.spot.title}
                selected={
                  item.spot.id === selectedId ||
                  highlightIds.includes(item.spot.id)
                }
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
              filled={draft.filled}
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
          rel="noopener noreferrer"
          className={cn(hoverClass.link, 'text-foreground underline')}
        >
          {t('board.attributionOfm')}
        </a>
        {separator}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(hoverClass.link, 'text-foreground underline')}
        >
          {t('board.attributionOsm')}
        </a>
      </p>
    </div>
  )
}

function fitBox(
  map: MaplibreMap,
  bounds: LngLatBounds,
  duration: number,
  padding: number,
  maxZoom?: number,
) {
  map.fitBounds(
    [
      [bounds.minLng, bounds.minLat],
      [bounds.maxLng, bounds.maxLat],
    ],
    { padding, ...(maxZoom != null ? { maxZoom } : {}), duration },
  )
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
