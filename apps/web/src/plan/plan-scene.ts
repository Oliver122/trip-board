import { planDays, type PlanEntry, type Spot } from '@tripboard/shared'
import type { AppLocale } from '../lib/locale'
import type { PlanMapScene } from '../trips/trip-context'

const intlLocale: Record<AppLocale, string> = { en: 'en-GB', de: 'de-DE' }

/** "Mon 13 Apr" / "Mo., 13. Apr." for a `YYYY-MM-DD` day (R-46-02, R-46-06). */
export function formatDayLabel(date: string, locale: AppLocale): string {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12))
  return new Intl.DateTimeFormat(intlLocale[locale], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(value)
}

/** The plan layer the Schedule tab hands to the shared map (R-46-05..R-46-09). */
export function buildPlanScene({
  entries,
  spots,
  tripStart,
  locale,
  focusedDate,
  selectedLinkId,
}: {
  entries: PlanEntry[]
  spots: Spot[]
  tripStart: string | null
  locale: AppLocale
  focusedDate: string | null
  selectedLinkId: string | null
}): PlanMapScene {
  const byId = new Map(spots.map((spot) => [spot.id, spot]))
  const { days } = planDays(entries, { tripStart })
  const dated = new Set<string>()
  const mapDays = days.map((day) => ({
    date: day.date,
    label: formatDayLabel(day.date, locale),
    colorIndex: day.colorIndex,
    stops: day.stops.flatMap((stop) => {
      const spot = byId.get(stop.spotId)
      if (!spot) return []
      dated.add(stop.spotId)
      return [
        {
          linkId: stop.linkId,
          entryId: stop.entryId,
          spotId: stop.spotId,
          title: stop.title,
          stopNumber: stop.stopNumber,
          lng: spot.lng,
          lat: spot.lat,
        },
      ]
    }),
  }))
  return {
    days: mapDays.filter((day) => day.stops.length > 0),
    undatedSpotIds: spots
      .filter((spot) => !dated.has(spot.id))
      .map((spot) => spot.id),
    focusedDate,
    selectedLinkId,
    showHint: entries.length > 0 && days.length === 0,
  }
}
