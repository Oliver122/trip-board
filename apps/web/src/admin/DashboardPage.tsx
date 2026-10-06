import type { AdminMetrics, AdminStats } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { ErrorState, LoadingState } from '../components/states'
import { formatDate } from '../lib/format'
import { activeLocale } from '../i18n'
import { getMetrics, getStats } from './client'
import { formatBytes, formatCount } from './format'
import {
  AreaChart,
  BarChart,
  HorizontalChart,
  InsightChart,
  LineChart,
  StackedChart,
} from './InsightChart'

const ranges = ['7d', '30d', '90d', 'all'] as const
type Range = (typeof ranges)[number]

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const [params, setParams] = useSearchParams()
  const requested = params.get('range')
  const range: Range = ranges.includes(requested as Range)
    ? (requested as Range)
    : '30d'
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const { from, to } = metricWindow(range)
    setStats(null)
    setMetrics(null)
    setError(false)
    void Promise.all([
      getStats(range, controller.signal),
      getMetrics(from, to, controller.signal),
    ])
      .then(([nextStats, nextMetrics]) => {
        if (controller.signal.aborted) return
        setStats(nextStats)
        setMetrics(nextMetrics)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [range])

  if (error) return <ErrorState />
  if (!stats || !metrics) return <LoadingState />

  const events = metrics.days.reduce((sum, day) => sum + day.eventsTotal, 0)
  const dayLabel = (day: string) => formatDate(day, locale)
  const bytes = (value: number) => formatBytes(value, locale)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('admin.nav.dashboard')}</h1>
        <div
          role="group"
          aria-label={t('admin.dashboard.range')}
          className="flex flex-wrap gap-1"
        >
          {ranges.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === range}
              className="inline-flex min-h-11 items-center rounded-[8px] border border-border px-3"
              onClick={() => setParams(item === '30d' ? {} : { range: item })}
            >
              {t(
                `admin.dashboard.${item === '7d' ? 'd7' : item === '30d' ? 'd30' : item === '90d' ? 'd90' : 'all'}`,
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          title={t('admin.dashboard.users')}
          value={formatCount(stats.usersTotal, locale)}
        >
          {t('admin.dashboard.usersNew', { count: stats.usersNew })}
        </Kpi>
        <Kpi
          title={t('admin.dashboard.active')}
          value={formatCount(stats.active7d, locale)}
        >
          {t('admin.dashboard.activeDetail', {
            day: formatCount(stats.active24h, locale),
            month: formatCount(stats.active30d, locale),
          })}
        </Kpi>
        <Kpi
          title={t('admin.dashboard.trips')}
          value={formatCount(stats.tripsTotal, locale)}
        >
          {t('admin.dashboard.usersNew', { count: stats.tripsNew })}
        </Kpi>
        <Kpi title={t('admin.dashboard.database')} value={bytes(stats.dbBytes)}>
          {bytes(stats.dbCapacityBytes)}
        </Kpi>
        <Kpi title={t('admin.dashboard.images')} value={bytes(stats.blobBytes)}>
          {bytes(stats.blobCapacityBytes)}
        </Kpi>
      </div>
      <p className="mb-4" data-testid="kpi-events">
        {t('admin.dashboard.events')} {formatCount(events, locale)}
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <InsightChart
          testId="chart-active"
          title={t('admin.dashboard.charts.active')}
          points={metrics.days.length}
          columns={[
            { key: 'day', label: t('admin.dashboard.day') },
            { key: 'active', label: t('admin.dashboard.series.active') },
          ]}
          rows={metrics.days.map((day) => ({
            key: day.day,
            cells: [dayLabel(day.day), formatCount(day.usersActive, locale)],
          }))}
        >
          <LineChart values={metrics.days.map((day) => day.usersActive)} />
        </InsightChart>
        <InsightChart
          testId="chart-activity"
          title={t('admin.dashboard.charts.activity')}
          points={metrics.activity.length}
          columns={[
            { key: 'day', label: t('admin.dashboard.day') },
            { key: 'spots', label: t('admin.dashboard.series.spots') },
            { key: 'plans', label: t('admin.dashboard.series.plans') },
            { key: 'images', label: t('admin.dashboard.series.images') },
            { key: 'other', label: t('admin.dashboard.series.other') },
          ]}
          rows={metrics.activity.map((day) => ({
            key: day.day,
            cells: [
              dayLabel(day.day),
              formatCount(day.spots, locale),
              formatCount(day.plans, locale),
              formatCount(day.images, locale),
              formatCount(day.other, locale),
            ],
          }))}
        >
          <StackedChart
            series={[
              {
                color: 'var(--cat-planned)',
                values: metrics.activity.map((day) => day.spots),
              },
              {
                color: 'var(--cat-maybe)',
                values: metrics.activity.map((day) => day.plans),
              },
              {
                color: 'var(--cat-home)',
                values: metrics.activity.map((day) => day.images),
              },
              {
                color: 'var(--muted)',
                values: metrics.activity.map((day) => day.other),
              },
            ]}
          />
        </InsightChart>
        <InsightChart
          testId="chart-storage"
          title={t('admin.dashboard.charts.storage')}
          points={metrics.days.length}
          columns={[
            { key: 'day', label: t('admin.dashboard.day') },
            { key: 'db', label: t('admin.dashboard.series.database') },
            { key: 'blob', label: t('admin.dashboard.series.blobs') },
            { key: 'capacity', label: t('admin.dashboard.series.capacity') },
          ]}
          rows={metrics.days.map((day) => ({
            key: day.day,
            cells: [
              dayLabel(day.day),
              bytes(day.dbBytes),
              bytes(day.imageBytesTotal),
              bytes(stats.dbCapacityBytes),
            ],
          }))}
        >
          <AreaChart
            left={metrics.days.map((day) => day.dbBytes)}
            right={metrics.days.map((day) => day.imageBytesTotal)}
            capacity={metrics.days.map(() => stats.dbCapacityBytes)}
          />
        </InsightChart>
        <InsightChart
          testId="chart-signups"
          title={t('admin.dashboard.charts.signups')}
          points={metrics.days.length}
          columns={[
            { key: 'day', label: t('admin.dashboard.day') },
            { key: 'signups', label: t('admin.dashboard.series.signups') },
          ]}
          rows={metrics.days.map((day) => ({
            key: day.day,
            cells: [dayLabel(day.day), formatCount(day.usersNew, locale)],
          }))}
        >
          <BarChart values={metrics.days.map((day) => day.usersNew)} />
        </InsightChart>
        <InsightChart
          testId="chart-users"
          title={t('admin.dashboard.charts.users')}
          points={metrics.topUsers.length}
          columns={[
            { key: 'name', label: t('admin.dashboard.name') },
            { key: 'bytes', label: t('admin.dashboard.series.bytes') },
          ]}
          rows={metrics.topUsers.map((user) => ({
            key: user.id,
            cells: [user.name, bytes(user.bytes)],
          }))}
        >
          <HorizontalChart
            rows={metrics.topUsers.map((user) => ({
              label: user.name,
              value: user.bytes,
            }))}
          />
        </InsightChart>
        <InsightChart
          testId="chart-trips"
          title={t('admin.dashboard.charts.trips')}
          points={metrics.topTrips.length}
          columns={[
            { key: 'name', label: t('admin.dashboard.name') },
            { key: 'events', label: t('admin.dashboard.series.events') },
          ]}
          rows={metrics.topTrips.map((trip) => ({
            key: trip.id,
            cells: [trip.name, formatCount(trip.events, locale)],
          }))}
        >
          <HorizontalChart
            rows={metrics.topTrips.map((trip) => ({
              label: trip.name,
              value: trip.events,
            }))}
          />
        </InsightChart>
      </div>
    </>
  )
}

function Kpi({
  title,
  value,
  children,
}: {
  title: string
  value: string
  children: string
}) {
  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-panel">
      <h2 className="text-sm text-muted">{title}</h2>
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-sm text-muted">{children}</p>
    </section>
  )
}

function metricWindow(range: Range): { from: string; to: string } {
  const to = new Date().toISOString().slice(0, 10)
  const span =
    range === '7d' ? 6 : range === '30d' ? 29 : range === '90d' ? 89 : 731
  const start = new Date(`${to}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - span)
  return { from: start.toISOString().slice(0, 10), to }
}
