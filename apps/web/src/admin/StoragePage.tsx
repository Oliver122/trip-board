import type { AdminStorage } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { ErrorState, LoadingState } from '../components/states'
import { activeLocale } from '../i18n'
import { getStorage } from './client'
import { formatBytes, formatCount, signedBytes } from './format'

export function StoragePage() {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const [storage, setStorage] = useState<AdminStorage | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void getStorage(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setStorage(next)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [])

  if (error) return <ErrorState />
  if (!storage) return <LoadingState />

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{t('admin.nav.storage')}</h1>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <UsageCard
          title={t('admin.storage.database')}
          used={storage.dbBytes}
          capacity={storage.dbCapacityBytes}
          growth={storage.dbGrowthBytes}
          forecast={storage.dbFullInDays}
        />
        <UsageCard
          title={t('admin.storage.images')}
          used={storage.blobBytes}
          capacity={storage.blobCapacityBytes}
          growth={storage.blobGrowthBytes}
          forecast={storage.blobFullInDays}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="tables-heading">
          <h2 id="tables-heading" className="mb-2 font-semibold">
            {t('admin.storage.tables')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-border px-2 py-2">
                    {t('admin.storage.table')}
                  </th>
                  <th scope="col" className="border-b border-border px-2 py-2">
                    {t('admin.storage.data')}
                  </th>
                  <th scope="col" className="border-b border-border px-2 py-2">
                    {t('admin.storage.index')}
                  </th>
                  <th scope="col" className="border-b border-border px-2 py-2">
                    {t('admin.storage.rows')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {storage.tables.map((table) => (
                  <tr key={table.name}>
                    <td className="px-2 py-2">{table.name}</td>
                    <td className="px-2 py-2">
                      {formatBytes(table.tableBytes, locale)}
                    </td>
                    <td className="px-2 py-2">
                      {formatBytes(table.indexBytes, locale)}
                    </td>
                    <td className="px-2 py-2">
                      {formatCount(table.estimatedRows, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="space-y-6">
          <RankList
            titleId="biggest-users"
            title={t('admin.storage.biggestUsers')}
            valueLabel={t('admin.storage.images')}
            empty={t('admin.storage.emptyUsers')}
            rows={storage.biggestUsers.map((user) => ({
              id: user.id,
              href: `/admin/users/${user.id}`,
              name: user.name,
              value: formatBytes(user.bytes, locale),
            }))}
          />
          <RankList
            titleId="biggest-trips"
            title={t('admin.storage.biggestTrips')}
            valueLabel={t('admin.storage.images')}
            empty={t('admin.storage.emptyTrips')}
            rows={storage.biggestTrips.map((trip) => ({
              id: trip.id,
              href: `/admin/trips/${trip.id}`,
              name: trip.name,
              value: formatBytes(trip.bytes, locale),
            }))}
          />
        </div>
      </div>
    </>
  )
}

function UsageCard({
  title,
  used,
  capacity,
  growth,
  forecast,
}: {
  title: string
  used: number
  capacity: number
  growth: number | null
  forecast: number | null
}) {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const pct = capacity > 0 ? Math.min(100, (100 * used) / capacity) : 0
  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-panel">
      <h2 className="mb-2 font-semibold">{title}</h2>
      <p className="mb-2">
        {t('admin.storage.of', {
          used: formatBytes(used, locale),
          capacity: formatBytes(capacity, locale),
        })}
      </p>
      <div
        className="mb-2 h-3 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={Math.min(used, capacity)}
        aria-label={title}
      >
        <div className="h-3 bg-foreground" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-muted">
        {t('admin.storage.summary', {
          growth:
            growth === null
              ? t('admin.storage.noForecast')
              : t('admin.storage.growth', {
                  value: signedBytes(growth, locale),
                }),
          forecast: forecastText(forecast, t),
        })}
      </p>
    </section>
  )
}

function forecastText(
  days: number | null,
  t: (key: string, options?: { count: number }) => string,
): string {
  if (days === null) return t('admin.storage.noForecast')
  if (days < 60) return t('admin.storage.fullDays', { count: days })
  if (days < 730)
    return t('admin.storage.fullMonths', {
      count: Math.max(1, Math.round(days / 30)),
    })
  return t('admin.storage.fullYears', {
    count: Math.max(1, Math.round(days / 365)),
  })
}

function RankList({
  titleId,
  title,
  valueLabel,
  empty,
  rows,
}: {
  titleId: string
  title: string
  valueLabel: string
  empty: string
  rows: { id: string; href: string; name: string; value: string }[]
}) {
  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="mb-2 font-semibold">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="border-b border-border px-2 py-2">
                {title}
              </th>
              <th scope="col" className="border-b border-border px-2 py-2">
                {valueLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-2 py-2">
                  <Link
                    to={row.href}
                    className={cn(hoverClass.link, 'underline')}
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-2 py-2">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
