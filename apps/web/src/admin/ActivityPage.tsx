import type { ActivityEvent } from '@tripboard/shared'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { ErrorState, EmptyState, LoadingState } from '../components/states'
import { Button } from '../components/ui/button'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { formatDate, formatTime } from '../lib/format'
import { activeLocale } from '../i18n'
import { activitySentence } from './activity-text'
import { activityExportPath, listActivity } from './client'

export function ActivityPage() {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const [params, setParams] = useSearchParams()
  const search = params.toString()
  const query = search ? `?${search}` : ''
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [watermark, setWatermark] = useState(0)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState(false)
  const [draft, setDraft] = useState({
    user: params.get('user') ?? '',
    trip: params.get('trip') ?? '',
    action: params.get('action') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  })

  useEffect(() => {
    setDraft({
      user: params.get('user') ?? '',
      trip: params.get('trip') ?? '',
      action: params.get('action') ?? '',
      from: params.get('from') ?? '',
      to: params.get('to') ?? '',
    })
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    setEvents(null)
    setError(false)
    setPending(0)
    void listActivity(query, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return
        setEvents(page.events)
        setCursor(page.nextCursor)
        setWatermark(page.events[0]?.id ?? 0)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [query])

  useEffect(() => {
    const look = () => {
      if (document.visibilityState !== 'visible') return
      void listActivity(query)
        .then((page) => {
          const count = page.events.filter(
            (event) => event.id > watermark,
          ).length
          if (count > 0) setPending(count)
        })
        .catch(() => undefined)
    }
    const timer = window.setInterval(look, 15_000)
    document.addEventListener('visibilitychange', look)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', look)
    }
  }, [query, watermark])

  function apply(event: FormEvent) {
    event.preventDefault()
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(draft)) {
      if (value.trim()) next.set(key, value.trim())
    }
    setParams(next)
  }

  async function showNew() {
    const page = await listActivity(query)
    setEvents(page.events)
    setCursor(page.nextCursor)
    setWatermark(page.events[0]?.id ?? 0)
    setPending(0)
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('admin.nav.activity')}</h1>
        <a
          className={cn(
            hoverClass.link,
            'inline-flex min-h-11 items-center underline',
          )}
          href={activityExportPath(query)}
        >
          {t('admin.activity.export')}
        </a>
      </div>
      <p className="mb-3 text-sm text-muted">{t('admin.activity.live')}</p>
      <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={apply}>
        <Field
          label={t('admin.activity.user')}
          value={draft.user}
          onChange={(user) => setDraft({ ...draft, user })}
        />
        <Field
          label={t('admin.activity.trip')}
          value={draft.trip}
          onChange={(trip) => setDraft({ ...draft, trip })}
        />
        <Field
          label={t('admin.activity.action')}
          value={draft.action}
          onChange={(action) => setDraft({ ...draft, action })}
        />
        <Field
          label={t('admin.activity.from')}
          value={draft.from}
          type="date"
          onChange={(from) => setDraft({ ...draft, from })}
        />
        <Field
          label={t('admin.activity.to')}
          value={draft.to}
          type="date"
          onChange={(to) => setDraft({ ...draft, to })}
        />
        <Button type="submit">{t('admin.activity.apply')}</Button>
      </form>
      {pending > 0 ? (
        <Button className="mb-4" onClick={() => void showNew()}>
          {t('admin.activity.newCount', { count: pending })}
        </Button>
      ) : null}
      {error ? <ErrorState /> : null}
      {!error && !events ? <LoadingState /> : null}
      {events && events.length === 0 ? (
        <EmptyState title={t('admin.activity.empty')} />
      ) : null}
      {events && events.length > 0 ? (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="border-b border-border pb-3">
              <p className="text-sm text-muted">
                <time dateTime={event.createdAt}>
                  {formatDate(event.createdAt, locale)}{' '}
                  {formatTime(event.createdAt, locale)}
                </time>
              </p>
              <p>
                {activitySentence(
                  {
                    action: event.action,
                    actorName: event.actorName,
                    tripName: event.tripName,
                    metadata: event.metadata,
                  },
                  locale,
                )}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {cursor ? (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => {
            void listActivity(
              `${query}${query ? '&' : '?'}cursor=${encodeURIComponent(cursor)}`,
            ).then((page) => {
              setEvents((current) => [...(current ?? []), ...page.events])
              setCursor(page.nextCursor)
            })
          }}
        >
          {t('admin.more')}
        </Button>
      ) : null}
    </>
  )
}

function Field({
  label,
  value,
  type = 'text',
  onChange,
}: {
  label: string
  value: string
  type?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
      />
    </label>
  )
}
