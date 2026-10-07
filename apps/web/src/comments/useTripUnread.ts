import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getTrip } from '../trips/client'
import { onCommentsChanged } from './bus'

/**
 * Unread comments across the trip, for the News badge and the tab title.
 * Reloads whenever a comment changes in this tab or arrives live.
 */
export function useTripUnread(tripId: string | undefined): number {
  const { t } = useTranslation()
  const [state, setState] = useState<{
    tripId: string
    name: string
    total: number
  } | null>(null)

  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    const load = () => {
      getTrip(tripId)
        .then((trip) => {
          if (cancelled) return
          setState({ tripId, name: trip.name, total: trip.unreadComments })
        })
        .catch(() => undefined)
    }
    load()
    const stop = onCommentsChanged(load)
    return () => {
      cancelled = true
      stop()
    }
  }, [tripId])

  const current = state && state.tripId === tripId ? state : null
  const total = current?.total ?? 0
  const name = current?.name ?? null

  useEffect(() => {
    if (name === null) return
    const previous = document.title
    document.title =
      total > 0
        ? t('news.tabTitle', { count: total, trip: name, app: t('appName') })
        : `${name} · ${t('appName')}`
    return () => {
      document.title = previous
    }
  }, [name, total, t])

  return total
}
