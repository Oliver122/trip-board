import type { AdminTrip } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { ErrorState, LoadingState } from '../components/states'
import { megabytes } from '../images/format'
import { formatDate } from '../lib/format'
import { activeLocale } from '../i18n'
import { listAdminTrips } from './client'

export function TripsPage() {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const [query, setQuery] = useState('')
  const [trips, setTrips] = useState<AdminTrip[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    const search = params.size > 0 ? `?${params.toString()}` : ''
    void listAdminTrips(search, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setTrips(page.trips)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [query])

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{t('admin.nav.trips')}</h1>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label={t('admin.trips.search')}
        placeholder={t('admin.trips.search')}
        className="mb-4 min-h-11 w-full max-w-md rounded-[8px] border border-border bg-card px-3"
      />
      {error ? <ErrorState /> : null}
      {!trips && !error ? <LoadingState /> : null}
      {trips && trips.length === 0 ? (
        <p className="text-muted">{t('admin.trips.empty')}</p>
      ) : null}
      {trips && trips.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                {(
                  [
                    'name',
                    'owner',
                    'members',
                    'spots',
                    'plans',
                    'images',
                    'storage',
                    'created',
                  ] as const
                ).map((key) => (
                  <th
                    key={key}
                    scope="col"
                    className="border-b border-border px-2 py-2"
                  >
                    {t(`admin.trips.col.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => (
                <tr key={trip.id} className="border-b border-border">
                  <td className="px-2 py-1">
                    <Link
                      to={`/admin/trips/${trip.id}`}
                      className={cn(
                        hoverClass.item,
                        'inline-flex min-h-11 items-center underline',
                      )}
                    >
                      {trip.name}
                    </Link>
                  </td>
                  <td className="px-2 py-1">
                    {trip.ownerName ?? t('admin.trips.none')}
                  </td>
                  <td className="px-2 py-1">{trip.members}</td>
                  <td className="px-2 py-1">{trip.spots}</td>
                  <td className="px-2 py-1">{trip.planEntries}</td>
                  <td className="px-2 py-1">{trip.images}</td>
                  <td className="px-2 py-1">{megabytes(trip.imageBytes)}</td>
                  <td className="px-2 py-1">
                    {formatDate(trip.createdAt, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  )
}
