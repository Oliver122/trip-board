import i18n from '../i18n'
import type { AppLocale } from '../lib/locale'

export const activityActions = [
  'user.login',
  'user.locale_update',
  'trip.create',
  'trip.update',
  'trip.delete',
  'trip.transfer',
  'member.join',
  'member.role_update',
  'member.remove',
  'member.leave',
  'invite.create',
  'invite.revoke',
  'spot.create',
  'spot.update',
  'spot.delete',
  'spot.import',
  'plan.create',
  'plan.update',
  'plan.delete',
  'plan.spot_add',
  'plan.spot_remove',
  'image.upload',
  'image.delete',
  'export.download',
  'quota.request',
  'comment.create',
  'comment.update',
  'comment.delete',
  'kind.create',
  'kind.update',
  'kind.reorder',
  'kind.delete',
  'kind.limit_request',
] as const

export function activitySentence(
  input: {
    action: string
    actorName?: string | null
    tripName?: string | null
    metadata?: Record<string, unknown>
  },
  locale: AppLocale,
): string {
  const metadata = input.metadata ?? {}
  // A delete that moved spots names where they went.
  const key =
    input.action === 'kind.delete' && text(metadata, 'movedTo')
      ? 'kind.deleteMoved'
      : input.action
  return i18n.t(`admin.activity.actions.${key}`, {
    lng: locale,
    defaultValue: input.action,
    actor: input.actorName || i18n.t('admin.activity.someone', { lng: locale }),
    trip: text(metadata, 'trip') || input.tripName || '',
    spot: text(metadata, 'spot') || text(metadata, 'title'),
    plan: text(metadata, 'plan'),
    name: text(metadata, 'name'),
    moved: text(metadata, 'moved'),
    movedTo: text(metadata, 'movedTo'),
    count: text(metadata, 'count'),
    role: text(metadata, 'role'),
    code: text(metadata, 'code'),
    format: text(metadata, 'format'),
    locale: text(metadata, 'locale'),
    from: text(metadata, 'from'),
    to: text(metadata, 'to'),
  })
}

function text(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  if (typeof value === 'string' || typeof value === 'number')
    return String(value)
  return ''
}
