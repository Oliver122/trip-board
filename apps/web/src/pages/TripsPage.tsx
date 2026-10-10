import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { Button } from '../components/ui/button'
import { useSession } from '../session'
import { isAuth } from '../api/http'
import { listTrips } from '../trips/client'
import { CreateTripDialog } from '../trips/CreateTripDialog'
import { TripCard } from '../trips/TripCard'
import type { Trip } from '@tripboard/shared'

export function TripsPage() {
  const { t } = useTranslation()
  const { reload } = useSession()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [trips, setTrips] = useState<Trip[]>([])
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    const controller = new AbortController()
    setStatus('loading')
    void listTrips(controller.signal)
      .then((next) => {
        setTrips(next)
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

  const close = useCallback(() => setOpen(false), [])

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('trips.title')}</h1>
        <Button onClick={() => setOpen(true)}>{t('trips.new')}</Button>
      </div>
      {status === 'loading' ? <LoadingState /> : null}
      {status === 'error' ? (
        <ErrorState message={t('trips.errors.load')} retry={load} />
      ) : null}
      {status === 'ready' && trips.length === 0 ? (
        <div className="grid justify-items-center gap-4">
          <EmptyState
            title={t('trips.empty')}
            description={t('trips.emptyHint')}
          />
          <Button onClick={() => setOpen(true)}>
            {t('trips.createFirst')}
          </Button>
        </div>
      ) : null}
      {status === 'ready' && trips.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      ) : null}
      <CreateTripDialog
        open={open}
        onClose={close}
        onUnauthorized={reload}
        onCreated={(trip) => {
          setOpen(false)
          navigate(`/trips/${trip.id}`)
        }}
      />
    </main>
  )
}
