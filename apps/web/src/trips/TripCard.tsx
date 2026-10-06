import type { Trip, TripRole } from '@tripboard/shared'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { activeLocale } from '../i18n'
import { formatDate } from '../lib/format'

export function TripCard({ trip }: { trip: Trip }) {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const dates = dateRange(trip.startDate, trip.endDate, locale)
  const roleLabel = roleName(t, trip.role)

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-panel">
      <Link
        to={`/trips/${trip.id}`}
        className="flex flex-col gap-3 text-foreground no-underline"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{trip.name}</h2>
          <span className="rounded-full bg-background px-2 py-0.5 text-xs">
            {roleLabel}
          </span>
        </div>
        {dates ? <p className="text-muted">{dates}</p> : null}
        <MemberAvatars members={trip.members} />
        {trip.createdByName ? (
          <p className="text-sm text-muted">
            {t('trips.createdBy', { name: trip.createdByName })}
          </p>
        ) : null}
      </Link>
      <Link to={`/trips/${trip.id}/settings`} className="text-sm">
        {t('trips.settings')}
      </Link>
    </article>
  )
}

export function MemberAvatars({ members }: { members: Trip['members'] }) {
  const { t } = useTranslation()
  return (
    <ul className="flex list-none p-0" aria-label={t('trips.members')}>
      {members.map((member) => (
        <li key={member.id} className="-ml-2 first:ml-0">
          {member.avatarUrl ? (
            <img
              src={member.avatarUrl}
              alt={member.name}
              width={28}
              height={28}
              className="size-7 rounded-full border-2 border-card object-cover"
            />
          ) : (
            <span
              aria-label={member.name}
              className="inline-flex size-7 items-center justify-center rounded-full border-2 border-card bg-border text-xs"
            >
              {member.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function roleName(t: (key: string) => string, role: TripRole): string {
  if (role === 'owner') return t('trips.roles.owner')
  if (role === 'planner') return t('trips.roles.planner')
  return t('trips.roles.visitor')
}

export function dateRange(
  start: string | null,
  end: string | null,
  locale: 'en' | 'de',
): string | null {
  const startText = start ? formatDate(start, locale) : null
  const endText = end ? formatDate(end, locale) : null
  if (startText && endText) return `${startText} – ${endText}`
  return startText ?? endText
}
