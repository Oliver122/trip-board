import type { Trip, TripRole } from '@tripboard/shared'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { hoverClass } from '../components/ui/hover'
import { activeLocale } from '../i18n'
import { useDataSaver } from '../lib/data-saver'
import { cn } from '../lib/utils'
import { formatDate } from '../lib/format'

export function TripCard({ trip }: { trip: Trip }) {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const dates = dateRange(trip.startDate, trip.endDate, locale)
  const roleLabel = roleName(t, trip.role)

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-panel transition-[border-color,box-shadow] duration-150 motion-reduce:duration-0 hover:border-foreground/40 hover:shadow-lift">
      <Link
        to={`/trips/${trip.id}`}
        className={cn(
          hoverClass.card,
          'flex flex-col gap-3 text-foreground no-underline',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{trip.name}</h2>
          <span className="rounded-full bg-background px-2 py-0.5 text-xs">
            {roleLabel}
          </span>
        </div>
        {dates ? <p className="text-muted">{dates}</p> : null}
        {trip.unreadComments > 0 ? (
          <p className="text-sm font-semibold text-accent">
            {t('news.tripNew', { count: trip.unreadComments })}
          </p>
        ) : null}
        <MemberAvatars members={trip.members} max={MAX_VISIBLE_MEMBERS} />
        {trip.createdByName ? (
          <p className="text-sm text-muted">
            {t('trips.createdBy', { name: trip.createdByName })}
          </p>
        ) : null}
      </Link>
      <Link
        to={`/trips/${trip.id}/settings`}
        className={cn(hoverClass.link, 'text-sm')}
      >
        {t('trips.settings')}
      </Link>
    </article>
  )
}

export const MAX_VISIBLE_MEMBERS = 4

export function memberGroupLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  members: Trip['members'],
  max = MAX_VISIBLE_MEMBERS,
): string {
  const names = members.map((member) => member.name)
  const and = t('header.membersAnd')
  const list =
    names.length > max
      ? `${names.slice(0, max - 1).join(', ')} ${t('header.membersMore', { count: names.length - (max - 1) })}`
      : joinNames(names, and)
  return t('header.membersList', { list })
}

function joinNames(names: string[], and: string): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`
}

export function MemberAvatars({
  members,
  max = MAX_VISIBLE_MEMBERS,
  ring = 'card',
  labelled = true,
}: {
  members: Trip['members']
  max?: number
  ring?: 'card' | 'background'
  labelled?: boolean
}) {
  const { t } = useTranslation()
  const overflow = members.length > max
  const visible = overflow ? members.slice(0, max - 1) : members
  const hidden = overflow ? members.slice(max - 1) : []
  const ringClass = ring === 'background' ? 'ring-background' : 'ring-card'
  return (
    <ul
      className="flex list-none p-0"
      aria-label={labelled ? t('trips.members') : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {visible.map((member) => (
        <li key={member.id} className="-ml-2 first:ml-0">
          <AvatarFace member={member} ringClass={ringClass} />
        </li>
      ))}
      {hidden.length > 0 ? (
        <li className="-ml-2" data-testid="member-overflow">
          <span
            title={hidden.map((member) => member.name).join(', ')}
            className={cn(
              hoverClass.avatar,
              'inline-flex size-8 items-center justify-center rounded-full bg-border text-xs ring-2',
              ringClass,
            )}
          >
            {'+' + hidden.length}
          </span>
        </li>
      ) : null}
    </ul>
  )
}

function AvatarFace({
  member,
  ringClass,
}: {
  member: Trip['members'][number]
  ringClass: string
}) {
  const { on: lowData } = useDataSaver()
  const face = cn(
    hoverClass.avatar,
    'size-8 rounded-full object-cover ring-2',
    ringClass,
  )
  if (member.avatarUrl && !lowData) {
    return (
      <img
        src={member.avatarUrl}
        alt={member.name}
        title={member.name}
        width={32}
        height={32}
        data-testid="member-avatar"
        className={face}
      />
    )
  }
  return (
    <span
      title={member.name}
      data-testid="member-avatar"
      className={cn(
        face,
        'inline-flex items-center justify-center bg-border text-xs text-foreground',
      )}
    >
      {member.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function roleName(t: (key: string) => string, role: TripRole): string {
  if (role === 'owner') return t('trips.roles.owner')
  if (role === 'admin') return t('trips.roles.admin')
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
