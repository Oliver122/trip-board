import type {
  AdminOps,
  HousekeepingJobName,
  JobStatus,
} from '@tripboard/shared'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { relativeTime, fullDate } from '../comments/time'
import { ErrorNotice } from '../components/notice'
import { LoadingState } from '../components/states'
import { hoverClass } from '../components/ui/hover'
import { activeLocale } from '../i18n'
import { cn } from '../lib/utils'
import { formatDate } from '../lib/format'
import { formatCount } from './format'
import { getOps, runOpsJob } from './client'
import { InsightChart, MultiLineChart } from './InsightChart'

type DashboardRange = '7d' | '30d' | '90d' | 'all'

/** R-45-09: the dashboard's range drives the ops chart; all falls back to 90d. */
function opsRange(range: DashboardRange): '7d' | '30d' | '90d' {
  return range === 'all' ? '90d' : range
}

/** Overdue: the last start is older than two intervals (R-45-09). */
function isOverdue(job: JobStatus, now: number): boolean {
  return (
    job.lastStartedAt != null &&
    now - new Date(job.lastStartedAt).getTime() > 2 * job.intervalMs
  )
}

export function ServiceHealth({ range }: { range: DashboardRange }) {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const [ops, setOps] = useState<AdminOps | null>(null)
  const [error, setError] = useState(false)
  const [running, setRunning] = useState<HousekeepingJobName | null>(null)
  const [runError, setRunError] = useState(false)
  const opsKey = opsRange(range)

  const load = useCallback(
    (signal?: AbortSignal) =>
      getOps(opsKey, signal)
        .then((next) => {
          if (signal?.aborted) return
          setOps(next)
          setError(false)
        })
        .catch(() => {
          if (!signal?.aborted) setError(true)
        }),
    [opsKey],
  )

  useEffect(() => {
    const controller = new AbortController()
    setOps(null)
    setError(false)
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function run(job: HousekeepingJobName) {
    setRunning(job)
    setRunError(false)
    try {
      await runOpsJob(job)
    } catch {
      setRunError(true)
    }
    await load()
    setRunning(null)
  }

  const now = Date.now()
  return (
    <section
      data-testid="service-health"
      aria-labelledby="service-health-title"
      className="mt-6 space-y-4"
    >
      <h2 id="service-health-title" className="text-lg font-semibold">
        {t('admin.dashboard.health.title')}
      </h2>
      {error ? (
        <ErrorNotice>{t('admin.dashboard.health.loadError')}</ErrorNotice>
      ) : !ops ? (
        <LoadingState />
      ) : (
        <>
          <p data-testid="ops-started">
            {t('admin.dashboard.health.upSince', {
              when: fullDate(ops.startedAt, locale),
            })}
          </p>
          <InsightChart
            testId="chart-ops"
            title={t('admin.dashboard.health.chart')}
            points={ops.days.length}
            columns={[
              { key: 'day', label: t('admin.dashboard.day') },
              {
                key: 'starts',
                label: t('admin.dashboard.health.series.starts'),
              },
              {
                key: 'http5xx',
                label: t('admin.dashboard.health.series.http5xx'),
              },
              {
                key: 'http429',
                label: t('admin.dashboard.health.series.http429'),
              },
            ]}
            rows={ops.days.map((day) => ({
              key: day.day,
              cells: [
                formatDate(day.day, locale),
                formatCount(day.apiStarts, locale),
                formatCount(day.http5xx, locale),
                formatCount(day.http429, locale),
              ],
            }))}
          >
            <MultiLineChart
              series={[
                {
                  color: 'var(--cat-planned)',
                  values: ops.days.map((day) => day.apiStarts),
                },
                {
                  color: 'var(--danger)',
                  values: ops.days.map((day) => day.http5xx),
                },
                {
                  color: 'var(--cat-maybe)',
                  values: ops.days.map((day) => day.http429),
                },
              ]}
            />
          </InsightChart>
          {runError ? (
            <ErrorNotice>{t('admin.dashboard.health.runFailed')}</ErrorNotice>
          ) : null}
          <div className="overflow-x-auto rounded-card border border-border bg-card p-4 shadow-panel">
            <table
              data-testid="ops-jobs"
              className="w-full border-collapse text-left text-sm"
            >
              <caption className="sr-only">
                {t('admin.dashboard.health.jobs')}
              </caption>
              <thead>
                <tr>
                  {(['job', 'lastRun', 'result', 'action'] as const).map(
                    (column) => (
                      <th
                        key={column}
                        scope="col"
                        className="border-b border-border px-2 py-2"
                      >
                        {t(`admin.dashboard.health.${column}`)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {ops.jobs.map((job) => {
                  const overdue = isOverdue(job, now)
                  const name = t(`admin.dashboard.health.names.${job.job}`)
                  return (
                    <tr
                      key={job.job}
                      data-testid={`job-${job.job}`}
                      data-overdue={overdue ? 'true' : 'false'}
                      data-result={job.lastResult ?? 'none'}
                    >
                      <th
                        scope="row"
                        id={`job-name-${job.job}`}
                        className="px-2 py-2 font-medium"
                      >
                        {name}
                      </th>
                      <td className="px-2 py-2">
                        {job.lastStartedAt ? (
                          <>
                            {relativeTime(job.lastStartedAt, locale)}
                            {overdue ? (
                              <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
                                {t('admin.dashboard.health.overdue')}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted">
                            {t('admin.dashboard.health.notRun')}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {job.lastResult === 'ok'
                          ? t('admin.dashboard.health.ok')
                          : job.lastResult === 'error'
                            ? t('admin.dashboard.health.failed')
                            : null}
                        {job.lastResult === 'error' && job.lastError ? (
                          <span className="block text-muted">
                            {job.lastError}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          disabled={running != null}
                          aria-describedby={`job-name-${job.job}`}
                          className={cn(
                            hoverClass.secondary,
                            'inline-flex min-h-11 items-center rounded-[8px] px-3 disabled:opacity-60',
                          )}
                          onClick={() => void run(job.job)}
                        >
                          {running === job.job
                            ? t('admin.dashboard.health.running')
                            : t('admin.dashboard.health.runNow')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
