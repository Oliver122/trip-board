import { googleMapsUrlIn, type Trip } from '@tripboard/shared'
import { useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { isAuth } from '../api/http'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { Button, buttonVariants } from '../components/ui/button'
import { useSession } from '../session'
import { listTrips } from '../trips/client'
import { lastBoard } from './last-board'

const writerRoles = new Set(['planner', 'admin', 'owner'])

/** `/share?url=&text=&title=`: pick a trip, then hand the link to its board (R-33-08). */
export function SharePage() {
  const { t } = useTranslation()
  const { reload } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const legendId = useId()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [trips, setTrips] = useState<Trip[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(() => {
    const controller = new AbortController()
    setStatus('loading')
    void listTrips(controller.signal)
      .then((all) => {
        const mine = all.filter((trip) => writerRoles.has(trip.role))
        const last = lastBoard()
        setTrips(mine)
        setSelected(
          mine.find((trip) => trip.id === last)?.id ?? mine[0]?.id ?? null,
        )
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isAuth(error)) {
          reload()
          return
        }
        setStatus('error')
      })
    return () => controller.abort()
  }, [reload])

  useEffect(() => load(), [load])

  const url = params.get('url') ?? ''
  const text = params.get('text') ?? ''

  const proceed = () => {
    if (!selected) return
    const next = new URLSearchParams()
    const link = googleMapsUrlIn({ url, text }) ?? url
    if (link) next.set('addFrom', link)
    if (text) next.set('text', text)
    void navigate(`/trips/${selected}?${next.toString()}`)
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 md:px-8">
      <h1 className="mb-4 text-xl font-semibold">{t('share.title')}</h1>
      {status === 'loading' ? <LoadingState /> : null}
      {status === 'error' ? (
        <ErrorState message={t('share.loadError')} retry={load} />
      ) : null}
      {status === 'ready' && trips.length === 0 ? (
        <div className="grid justify-items-center gap-4">
          <EmptyState title={t('share.noTrips')} />
          <Link to="/trips" className={buttonVariants({ variant: 'outline' })}>
            {t('share.toTrips')}
          </Link>
        </div>
      ) : null}
      {status === 'ready' && trips.length > 0 ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            proceed()
          }}
          className="space-y-4"
        >
          <fieldset aria-labelledby={legendId} className="space-y-2">
            <legend id={legendId} className="mb-2 font-semibold">
              {t('share.pickTrip')}
            </legend>
            {trips.map((trip) => (
              <label
                key={trip.id}
                className="flex min-h-11 items-center gap-3 rounded-[8px] border border-border bg-card px-3"
              >
                <input
                  type="radio"
                  name="trip"
                  value={trip.id}
                  checked={selected === trip.id}
                  onChange={() => setSelected(trip.id)}
                />
                {trip.name}
              </label>
            ))}
          </fieldset>
          <Button type="submit">{t('share.continue')}</Button>
        </form>
      ) : null}
    </main>
  )
}
