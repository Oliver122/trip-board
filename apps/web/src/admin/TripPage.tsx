import type { AdminKindLimit, AdminTripDetail } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { ErrorState, LoadingState } from '../components/states'
import { megabytes } from '../images/format'
import { activeLocale } from '../i18n'
import { activitySentence } from './activity-text'
import { isNotFound } from '../api/http'
import { ErrorNotice } from '../components/notice'
import { Button } from '../components/ui/button'
import { getAdminTrip, patchKindLimit } from './client'
import { Sparkline } from './Sparkline'

export function TripPage() {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const { id = '' } = useParams()
  const [detail, setDetail] = useState<AdminTripDetail | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void getAdminTrip(id, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setDetail(next)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        if (isNotFound(reason)) setMissing(true)
        else setError(true)
      })
    return () => controller.abort()
  }, [id])

  if (missing) return <p>{t('admin.trips.missing')}</p>
  if (error) return <ErrorState />
  if (!detail) return <LoadingState />
  const { trip } = detail

  return (
    <>
      <p className="mb-2">
        <Link to="/admin/trips" className={cn(hoverClass.link, 'underline')}>
          {t('admin.nav.trips')}
        </Link>
      </p>
      <h1 className="mb-4 text-xl font-semibold">{trip.name}</h1>
      <dl className="mb-6 grid max-w-xl grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted">{t('admin.trips.col.members')}</dt>
          <dd>{trip.members}</dd>
        </div>
        <div>
          <dt className="text-muted">{t('admin.trips.col.spots')}</dt>
          <dd>{trip.spots}</dd>
        </div>
        <div>
          <dt className="text-muted">{t('admin.trips.col.plans')}</dt>
          <dd>{trip.planEntries}</dd>
        </div>
        <div>
          <dt className="text-muted">{t('admin.trips.col.storage')}</dt>
          <dd>
            {t('admin.user.megabytes', { value: megabytes(trip.imageBytes) })}
          </dd>
        </div>
      </dl>
      <KindLimit
        tripId={trip.id}
        limit={detail.kindLimit}
        onChange={(kindLimit) =>
          setDetail((current) =>
            current ? { ...current, kindLimit } : current,
          )
        }
      />
      <section className="mb-6" aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-2 font-semibold">
          {t('header.members')}
        </h2>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="border-b border-border px-2 py-2">
                {t('admin.users.col.username')}
              </th>
              <th scope="col" className="border-b border-border px-2 py-2">
                {t('admin.user.role')}
              </th>
            </tr>
          </thead>
          <tbody>
            {detail.members.map((member) => (
              <tr key={member.id}>
                <td className="px-2 py-2">
                  <Link
                    to={`/admin/users/${member.id}`}
                    className={cn(hoverClass.link, 'underline')}
                  >
                    {member.displayName ?? member.username}
                  </Link>
                </td>
                <td className="px-2 py-2">{t(`trips.roles.${member.role}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Sparkline
        values={detail.sparkline}
        href={`/admin/activity?trip=${trip.id}`}
      />
      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="mb-2 font-semibold">
          {t('admin.user.actions')}
        </h2>
        {detail.actions.length === 0 ? (
          <p className="text-muted">{t('admin.user.noActions')}</p>
        ) : (
          <ul className="space-y-1">
            {detail.actions.map((action) => (
              <li key={action.id}>
                {activitySentence(
                  {
                    action: action.action,
                    actorName: action.actorName,
                    tripName: action.tripName,
                    metadata: action.metadata,
                  },
                  locale,
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/** R-29-07: the effective kind limit, and a platform admin's override. */
function KindLimit({
  tripId,
  limit,
  onChange,
}: {
  tripId: string
  limit: AdminKindLimit
  onChange: (next: AdminKindLimit) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(String(limit.override ?? limit.effective))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failed, setFailed] = useState(false)

  function save(maxKinds: number | null) {
    setSaving(true)
    setSaved(false)
    setFailed(false)
    void patchKindLimit(tripId, {
      maxKinds,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    })
      .then((next) => {
        onChange(next)
        setValue(String(next.override ?? next.effective))
        setReason('')
        setSaved(true)
      })
      .catch(() => setFailed(true))
      .finally(() => setSaving(false))
  }

  const number = Number(value)
  const valid = Number.isInteger(number) && number >= 1 && number <= 64
  const source = `${t(limit.override === null ? 'admin.kindLimit.default' : 'admin.kindLimit.override')} (${limit.override ?? limit.default})`

  return (
    <section className="mb-6 max-w-xl" aria-labelledby="kind-limit-heading">
      <h2 id="kind-limit-heading" className="mb-2 font-semibold">
        {t('admin.kindLimit.title')}
      </h2>
      <p data-testid="kind-limit-effective">
        {t('admin.kindLimit.effective', {
          count: limit.count,
          limit: limit.effective,
        })}
      </p>
      <p data-testid="kind-limit-source" className="mb-3 text-sm text-muted">
        {source}
      </p>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) save(number)
        }}
      >
        <label className="block">
          {t('admin.kindLimit.field')}
          <input
            type="number"
            min={1}
            max={64}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
          />
        </label>
        <label className="block">
          {t('admin.kindLimit.reason')}
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
          />
        </label>
        {saved ? <p role="status">{t('admin.kindLimit.saved')}</p> : null}
        {failed ? (
          <ErrorNotice>{t('admin.user.errors.save')}</ErrorNotice>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!valid || saving}>
            {t('admin.kindLimit.set')}
          </Button>
          <Button
            variant="outline"
            disabled={limit.override === null || saving}
            onClick={() => save(null)}
          >
            {t('admin.kindLimit.clear')}
          </Button>
        </div>
      </form>
    </section>
  )
}
