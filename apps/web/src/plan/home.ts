import { entryFallsInStay, type PlanEntry, type Spot } from '@tripboard/shared'

/** Buckets always show the resolved home. Singles show it only inside a stay. */
export function scheduleHome(
  entry: PlanEntry,
  spots: Pick<Spot, 'baseCategory' | 'stayFrom' | 'stayTo'>[],
): PlanEntry['home'] {
  if (!entry.home) return null
  if (entry.type === 'bucket') return entry.home
  const inside = spots.some(
    (spot) =>
      spot.baseCategory === 'home' &&
      entryFallsInStay(
        entry.startDate,
        entry.endDate,
        spot.stayFrom,
        spot.stayTo,
      ),
  )
  return inside ? entry.home : null
}
