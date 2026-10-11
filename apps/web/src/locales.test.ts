import { kindErrorCodes, kindSymbols } from '@tripboard/shared'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import de from './locales/de/common.json'
import en from './locales/en/common.json'
import i18n from './i18n'

const publicEn = JSON.parse(
  readFileSync(
    new URL('../public/locales/en/common.json', import.meta.url),
    'utf8',
  ),
)
const publicDe = JSON.parse(
  readFileSync(
    new URL('../public/locales/de/common.json', import.meta.url),
    'utf8',
  ),
)

describe('locales', () => {
  it('T-03-01 en and de have the same keys', () => {
    const enKeys = flatKeys(en)
    const deKeys = flatKeys(de)
    const missingInDe = enKeys.filter((key) => !deKeys.includes(key))
    const missingInEn = deKeys.filter((key) => !enKeys.includes(key))
    expect({ missingInDe, missingInEn }).toEqual({
      missingInDe: [],
      missingInEn: [],
    })
    expect(publicEn).toEqual(en)
    expect(publicDe).toEqual(de)
  })

  it('T-28-20 has the step 28 keys in en and de', () => {
    const keys = [
      'trips.roles.admin',
      'category.must-go',
      'category.maybe',
      'category.planned',
      'category.home',
      'invite.singleUse',
      'invite.used',
      'kinds.title',
      'kinds.boardMenu',
      'kinds.field',
      'kinds.atMostTwo',
      'kinds.addTitle',
      'kinds.add',
      'kinds.moveUp',
      'kinds.moveDown',
      'kinds.delete',
      'kinds.deleteTitle',
      'kinds.deleteUsed_other',
      'kinds.moveTo',
      ...kindErrorCodes.map((code) => `kinds.errors.${code}`),
      ...kindSymbols.map((symbol) => `kinds.symbols.${symbol}`),
      'admin.activity.actions.kind.create',
      'admin.activity.actions.kind.update',
      'admin.activity.actions.kind.reorder',
      'admin.activity.actions.kind.delete',
    ]
    for (const lng of ['en', 'de'] as const) {
      const missing = keys.filter((key) => !i18n.exists(key, { lng }))
      expect({ lng, missing }).toEqual({ lng, missing: [] })
    }
    expect(i18n.t('trips.roles.admin', { lng: 'en' })).toBe('Board admin')
    expect(i18n.t('trips.roles.admin', { lng: 'de' })).toBe('Board-Admin')
    expect(
      i18n.t('kinds.deleteUsed', { count: 3, name: 'Food', lng: 'en' }),
    ).toBe('3 spots use Food.')
  })

  it('keeps the suspended-account sentence in both languages', () => {
    expect(i18n.t('login.cancelled', { lng: 'en' })).toBe('Login cancelled')
    expect(i18n.t('login.cancelled', { lng: 'de' })).not.toBe(
      i18n.t('login.cancelled', { lng: 'en' }),
    )
    expect(i18n.t('login.suspended', { reason: 'spam', lng: 'en' })).toBe(
      'Your account is suspended: spam',
    )
    expect(i18n.t('login.suspended', { reason: 'spam', lng: 'de' })).toBe(
      'Dein Konto ist gesperrt: spam',
    )
  })
})

function flatKeys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') return [path]
    return flatKeys(value as object, path)
  })
}
