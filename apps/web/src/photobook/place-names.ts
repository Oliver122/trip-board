import { useCallback, useEffect, useState } from 'react'
import { reverseAddress } from '../spots/client'
import type { AppLocale } from '../lib/locale'

// One reverse-geocode per distinct rounded point, one at a time, cached for the
// page's life (R-47-06). It is JSON, so low data still allows it (R-47-10).
const names = new Map<string, string | null>()
const queue: Array<{ key: string; lat: number; lng: number; lang: AppLocale }> =
  []
const listeners = new Set<() => void>()
let running = false

function nameKey(lat: number, lng: number, lang: AppLocale): string {
  return `${lang}:${lat.toFixed(3)},${lng.toFixed(3)}`
}

async function drain() {
  if (running) return
  running = true
  while (queue.length > 0) {
    const next = queue.shift()
    if (!next || names.has(next.key)) continue
    try {
      const place = await reverseAddress(
        Number(next.lat.toFixed(3)),
        Number(next.lng.toFixed(3)),
        next.lang,
      )
      names.set(next.key, place?.label ?? null)
    } catch {
      names.set(next.key, null)
    }
    for (const listener of listeners) listener()
  }
  running = false
}

/**
 * The reverse-geocoded name for each point, as a lookup that is null until it
 * arrives (or when it failed).
 */
export function usePlaceNames(
  points: Array<{ lat: number; lng: number }>,
  lang: AppLocale,
): (lat: number, lng: number) => string | null {
  const [version, setVersion] = useState(0)
  const signature = points
    .map((point) => nameKey(point.lat, point.lng, lang))
    .join('|')
  useEffect(() => {
    const bump = () => setVersion((value) => value + 1)
    listeners.add(bump)
    for (const point of points) {
      const key = nameKey(point.lat, point.lng, lang)
      if (names.has(key) || queue.some((item) => item.key === key)) continue
      queue.push({ key, lat: point.lat, lng: point.lng, lang })
    }
    void drain()
    return () => {
      listeners.delete(bump)
    }
    // `signature` stands for `points`.
  }, [signature, lang])
  // A new function per arrival, so memoised scenes that use it rebuild once.
  return useCallback(
    (lat: number, lng: number) => names.get(nameKey(lat, lng, lang)) ?? null,
    [lang, version],
  )
}
