import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { phoneQuery, useMediaQuery } from '../../lib/media'
import { useMapGate } from '../../map/map-gate'

export type PhoneView = 'map' | 'list'

/**
 * Step 38 (R-38-02): below 640 px the board shows *Map* or *List*, kept in the
 * query as `?view=list`. At ≥ 640 px the parameter is ignored. With low data on
 * and the map not loaded, a board without `?view` opens on *List* (R-38-09).
 */
export function usePhoneView(): {
  phone: boolean
  view: PhoneView
  setView: (view: PhoneView, options?: { replace?: boolean }) => void
} {
  const phone = useMediaQuery(phoneQuery)
  const [params, setParams] = useSearchParams()
  const gate = useMapGate()
  const param = params.get('view')
  const fallback: PhoneView = gate.ready ? 'map' : 'list'
  const view: PhoneView =
    param === 'list' ? 'list' : param === 'map' ? 'map' : fallback

  const setView = useCallback(
    (next: PhoneView, options?: { replace?: boolean }) => {
      setParams(
        (previous) => {
          const copy = new URLSearchParams(previous)
          if (next === 'list' || fallback === 'list') copy.set('view', next)
          else copy.delete('view')
          return copy
        },
        { replace: options?.replace ?? false },
      )
    },
    [fallback, setParams],
  )

  return { phone, view: phone ? view : 'map', setView }
}
