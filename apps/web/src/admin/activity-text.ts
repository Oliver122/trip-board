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
  return i18n.t(`admin.activity.actions.${input.action}`, {
    lng: locale,
    defaultValue: input.action,
    actor: input.actorName || i18n.t('admin.activity.someone', { lng: locale }),
    trip: text(metadata, 'trip') || input.tripName || '',
    spot: text(metadata, 'spot') || text(metadata, 'title'),
    plan: text(metadata, 'plan'),
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
