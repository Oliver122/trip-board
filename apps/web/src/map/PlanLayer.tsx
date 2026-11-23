import type { Map as MaplibreMap } from 'maplibre-gl'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Layer, Marker, Source, useMap } from 'react-map-gl/maplibre'
import { hoverClass } from '../components/ui/hover'
import { Switch } from '../components/ui/switch'
import { cn } from '../lib/utils'
import { dayColor, dayColorVar } from '../plan/day-colors'
import type { PlanMapScene } from '../trips/trip-context'
import { spreadCards, type CardBox } from './day-cards'
import { dayBounds, dayCentroid, dayLine, stopOffsets } from './plan-geojson'

const dayCardsStorageKey = 'scheduleDayCards'
const dimmedOpacity = 0.3
const cardWidth = 176
const cardHeight = 84

/** The *Day cards* switch state, kept in localStorage; default on (R-46-06). */
export function useDayCardsSetting(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(dayCardsStorageKey) !== '0'
    } catch {
      return true
    }
  })
  return [
    value,
    (next) => {
      setValue(next)
      try {
        localStorage.setItem(dayCardsStorageKey, next ? '1' : '0')
      } catch {
        // storage can be blocked; the choice then lasts for this visit only
      }
    },
  ]
}

/**
 * Numbered pins, dashed day lines and day cards of the plan (R-46-05..07).
 * Rendered inside `<Map>` only while the Schedule tab sets a plan scene.
 */
export function PlanLayer({
  plan,
  dark,
  cards,
  onPlanStop,
  onFocusDay,
}: {
  plan: PlanMapScene
  dark: boolean
  /** Cards are drawn (wide screen and the switch is on). */
  cards: boolean
  onPlanStop: (linkId: string, date: string) => void
  onFocusDay: (date: string | null) => void
}) {
  const { t } = useTranslation()
  const { current: mapRef } = useMap()
  const theme = dark ? 'dark' : 'light'
  const { focusedDate } = plan
  const offsets = useMemo(() => stopOffsets(plan.days), [plan.days])
  const planRef = useRef(plan)
  planRef.current = plan

  // R-46-07: fit to the focused day when the focus changes; a live plan
  // change alone never moves the camera (R-46-09).
  const fitted = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef?.getMap()
    if (!focusedDate) {
      fitted.current = null
      return
    }
    if (!map || fitted.current === focusedDate) return
    const day = planRef.current.days.find((item) => item.date === focusedDate)
    const box = day ? dayBounds(day.stops) : null
    if (!box) return
    fitted.current = focusedDate
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    map.fitBounds(
      [
        [box.minLng, box.minLat],
        [box.maxLng, box.maxLat],
      ],
      { padding: 48, maxZoom: 16, duration: reduced ? 0 : 600 },
    )
  }, [focusedDate, mapRef])

  // Escape ends the day focus unless it belongs to an open dialog.
  useEffect(() => {
    if (!focusedDate) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[role="dialog"]')) return
      onFocusDay(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [focusedDate, onFocusDay])

  const dimmed = (date: string) => focusedDate != null && focusedDate !== date

  return (
    <>
      {plan.days.map((day) => (
        <Source
          key={`line-${day.date}`}
          id={`plan-line-${day.date}`}
          type="geojson"
          data={dayLine(day)}
        >
          <Layer
            id={`plan-line-${day.date}`}
            type="line"
            layout={{ 'line-cap': 'butt', 'line-join': 'round' }}
            paint={{
              'line-color': dayColor(day.colorIndex, theme),
              'line-width': 3,
              'line-dasharray': [2, 2],
              'line-opacity': dimmed(day.date) ? dimmedOpacity : 1,
            }}
          />
        </Source>
      ))}
      {plan.days.flatMap((day) =>
        day.stops.map((stop) => (
          <Marker
            key={`stop-${stop.linkId}`}
            longitude={stop.lng}
            latitude={stop.lat}
            anchor="center"
            offset={offsets.get(stop.linkId) ?? [0, 0]}
            style={{ zIndex: plan.selectedLinkId === stop.linkId ? 5 : 4 }}
          >
            <button
              type="button"
              data-testid={`plan-pin-${stop.linkId}`}
              data-day={day.date}
              data-stop={stop.stopNumber}
              data-dimmed={dimmed(day.date) ? 'true' : undefined}
              data-selected={
                plan.selectedLinkId === stop.linkId ? 'true' : undefined
              }
              aria-label={t('planMap.pin', {
                day: day.label,
                stop: stop.stopNumber,
                spot: stop.title,
              })}
              className={cn(
                hoverClass.cluster,
                'inline-flex size-7 items-center justify-center rounded-full border-0 p-0 text-sm font-semibold text-white shadow-panel',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                plan.selectedLinkId === stop.linkId &&
                  'scale-125 ring-[3px] ring-white',
              )}
              style={{
                backgroundColor: dayColorVar(day.colorIndex),
                opacity: dimmed(day.date) ? dimmedOpacity : 1,
              }}
              onClick={() => onPlanStop(stop.linkId, day.date)}
            >
              {stop.stopNumber}
            </button>
          </Marker>
        )),
      )}
      {cards ? (
        <DayCards plan={plan} dimmed={dimmed} onFocusDay={onFocusDay} />
      ) : null}
    </>
  )
}

function DayCards({
  plan,
  dimmed,
  onFocusDay,
}: {
  plan: PlanMapScene
  dimmed: (date: string) => boolean
  onFocusDay: (date: string | null) => void
}) {
  const { t } = useTranslation()
  const { current: mapRef } = useMap()
  const elements = useRef(new Map<string, HTMLButtonElement>())
  const [shifts, setShifts] = useState<Record<string, number>>({})
  const anchors = useMemo(
    () => plan.days.map((day) => ({ day, at: dayCentroid(day.stops) })),
    [plan.days],
  )
  const anchorsRef = useRef(anchors)
  anchorsRef.current = anchors

  // R-46-06: project the cards, push overlapping ones apart vertically.
  function recompute(map: MaplibreMap) {
    const boxes: CardBox[] = anchorsRef.current.map(({ day, at }) => {
      const point = map.project([at.lng, at.lat])
      const element = elements.current.get(day.date)
      const width = element?.offsetWidth || cardWidth
      const height = element?.offsetHeight || cardHeight
      return {
        id: day.date,
        x: point.x - width / 2,
        y: point.y - height / 2,
        width,
        height,
      }
    })
    const next = spreadCards(boxes)
    setShifts((current) => {
      const same =
        Object.keys(next).length === Object.keys(current).length &&
        Object.entries(next).every(([key, value]) => current[key] === value)
      return same ? current : next
    })
  }

  useLayoutEffect(() => {
    const map = mapRef?.getMap()
    if (map) recompute(map)
  }, [anchors, mapRef])

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!map) return
    const run = () => recompute(map)
    map.on('moveend', run)
    map.on('zoomend', run)
    map.on('resize', run)
    return () => {
      map.off('moveend', run)
      map.off('zoomend', run)
      map.off('resize', run)
    }
  }, [mapRef])

  return (
    <>
      {anchors.map(({ day, at }) => {
        const focused = plan.focusedDate === day.date
        const stops = t('schedule.stops', { count: day.stops.length })
        return (
          <Marker
            key={`card-${day.date}`}
            longitude={at.lng}
            latitude={at.lat}
            anchor="center"
            offset={[0, shifts[day.date] ?? 0]}
            style={{ zIndex: 3 }}
          >
            <button
              type="button"
              ref={(element) => {
                if (element) elements.current.set(day.date, element)
                else elements.current.delete(day.date)
              }}
              data-testid={`day-card-${day.date}`}
              data-dimmed={dimmed(day.date) ? 'true' : undefined}
              aria-pressed={focused}
              aria-label={t('planMap.cardLabel', {
                day: day.label,
                stops,
              })}
              className={cn(
                hoverClass.card,
                'flex overflow-hidden rounded-card border border-border bg-card p-0 text-left text-sm text-foreground shadow-panel',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                focused && 'ring-2 ring-foreground',
              )}
              style={{
                width: cardWidth,
                opacity: dimmed(day.date) ? dimmedOpacity : 1,
              }}
              onClick={() => onFocusDay(focused ? null : day.date)}
            >
              <span
                aria-hidden="true"
                className="w-1.5 shrink-0"
                style={{ backgroundColor: dayColorVar(day.colorIndex) }}
              />
              <span className="min-w-0 flex-1 px-2 py-1.5">
                <span className="block font-semibold">
                  {t('planMap.card', { day: day.label, stops })}
                </span>
                {day.stops.slice(0, 3).map((stop) => (
                  <span
                    key={stop.linkId}
                    className="block truncate text-xs text-muted"
                  >
                    {stop.title}
                  </span>
                ))}
              </span>
            </button>
          </Marker>
        )
      })}
    </>
  )
}

/** Overlays of the plan map: the *Day cards* switch and the hint (R-46-06, R-46-09). */
export function PlanOverlay({
  plan,
  wide,
  cards,
  onCards,
}: {
  plan: PlanMapScene
  wide: boolean
  cards: boolean
  onCards: (value: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      {wide ? (
        <div className="absolute left-3 top-3 z-10 rounded-card border border-border bg-card px-3 shadow-panel">
          <Switch checked={cards} onChange={onCards} testId="day-cards-switch">
            {t('planMap.dayCards')}
          </Switch>
        </div>
      ) : null}
      {plan.showHint ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-12 z-10 flex justify-center">
          <p
            role="status"
            data-testid="plan-hint"
            className="m-0 rounded-card border border-border bg-card px-4 py-2 text-center shadow-panel"
          >
            {t('planMap.hint')}
          </p>
        </div>
      ) : null}
    </>
  )
}
