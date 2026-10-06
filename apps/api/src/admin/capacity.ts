export type CapacityLevel = 'amber' | 'red'

export function usageLevel(
  used: number,
  capacity: number,
  warnPct: number,
): CapacityLevel | null {
  if (capacity <= 0) return null
  const pct = (100 * used) / capacity
  if (pct >= 95) return 'red'
  if (pct >= warnPct) return 'amber'
  return null
}

export function capacityWarning(
  dbBytes: number,
  dbCapacity: number,
  blobBytes: number,
  blobCapacity: number,
  warnPct: number,
): { warning: 'db' | 'blob' | null; level: CapacityLevel | null } {
  const dbPct = dbCapacity > 0 ? (100 * dbBytes) / dbCapacity : 0
  const blobPct = blobCapacity > 0 ? (100 * blobBytes) / blobCapacity : 0
  const ranked = [
    {
      warning: 'db' as const,
      level: usageLevel(dbBytes, dbCapacity, warnPct),
      pct: dbPct,
    },
    {
      warning: 'blob' as const,
      level: usageLevel(blobBytes, blobCapacity, warnPct),
      pct: blobPct,
    },
  ]
    .filter((item) => item.level !== null)
    .sort((left, right) => right.pct - left.pct)
  const top = ranked[0]
  if (!top) return { warning: null, level: null }
  return { warning: top.warning, level: top.level }
}

/** Linear forecast from the change over the last 30 days. Null when usage is not growing. */
export function fullInDays(
  used: number,
  capacity: number,
  past: number | null,
): number | null {
  if (past === null) return null
  const growth = used - past
  if (growth <= 0) return null
  const remaining = capacity - used
  if (remaining <= 0) return 0
  return Math.round((remaining / growth) * 30)
}
