import {
  kindErrorCodes,
  kindPresets,
  kindSymbols,
  placeLinkErrorCodes,
} from '@tripboard/shared'
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

  it('T-29-24 has the step 29 keys in en and de', () => {
    const newPresets = kindPresets.filter(
      (preset) => preset !== 'must_go' && preset !== 'maybe',
    )
    const keys = [
      ...kindSymbols.map((symbol) => `kinds.symbols.${symbol}`),
      ...newPresets.map((preset) => `kinds.presets.${preset}`),
      'kinds.addMenu',
      'kinds.custom',
      'kinds.count',
      'kinds.limitReached',
      'kinds.requestMore',
      'kinds.symbolSearch',
      'kinds.symbolNone',
      'kinds.symbolGrid',
      'kinds.preview',
      'kinds.previewName',
      'kinds.request.title',
      'kinds.request.number',
      'kinds.request.message',
      'kinds.request.send',
      'kinds.request.pending',
      'kinds.request.approved',
      'kinds.request.rejected',
      'kinds.request.note',
      'kinds.request.dismiss',
      'kinds.request.invalidMax',
      'kinds.request.loadError',
      'kinds.errors.kind_preset_taken',
      'kinds.errors.request_pending',
      'kinds.errors.kind_limit',
      'ui.chips.search',
      'ui.chips.max',
      'ui.chips.noMatch',
      'ui.chips.all',
      'ui.chips.clear',
      'ui.chips.more',
      'admin.settings.kinds',
      'admin.settings.kindsPerTrip',
      'admin.kindLimit.title',
      'admin.kindLimit.effective',
      'admin.kindLimit.default',
      'admin.kindLimit.override',
      'admin.kindLimit.field',
      'admin.kindLimit.set',
      'admin.kindLimit.clear',
      'admin.requests.type',
      'admin.requests.filterType',
      'admin.requests.types.storage',
      'admin.requests.types.kinds',
      'admin.requests.kindSummary',
      'admin.requests.maxKinds',
      'admin.activity.actions.kind.limit_request',
    ]
    expect(kindSymbols).toHaveLength(64)
    for (const lng of ['en', 'de'] as const) {
      const missing = keys.filter((key) => !i18n.exists(key, { lng }))
      expect({ lng, missing }).toEqual({ lng, missing: [] })
    }
    expect(i18n.t('kinds.symbols.cat', { lng: 'de' })).toBe('Katze')
    expect(i18n.t('kinds.count', { count: 5, limit: 12, lng: 'en' })).toBe(
      '5 of 12 kinds',
    )
    expect(
      i18n.t('kinds.errors.kind_limit', { limit: 12, lng: 'de' }),
    ).toContain('12')
  })

  it('T-32-11 has the kinds section keys in en and de', () => {
    for (const lng of ['en', 'de'] as const) {
      for (const key of ['kinds.sectionTitle', 'kinds.sectionDescription']) {
        expect({ lng, key, has: i18n.exists(key, { lng }) }).toEqual({
          lng,
          key,
          has: true,
        })
      }
    }
    expect(i18n.t('kinds.sectionTitle', { lng: 'de' })).toBe('Ortsarten')
  })

  it('T-33-11 has the places and share keys in en and de', () => {
    const keys = [
      'places.looking',
      'places.linkField',
      'places.fillIn',
      'places.unplaced',
      'places.errors.rate_limited',
      'places.errors.generic',
      ...placeLinkErrorCodes.map((code) => `places.errors.${code}`),
    ]
    const shareKeys = flatKeys(en).filter((key) => key.startsWith('share.'))
    for (const lng of ['en', 'de'] as const) {
      const missing = [...keys, ...shareKeys].filter(
        (key) => !i18n.exists(key, { lng }),
      )
      expect({ lng, missing }).toEqual({ lng, missing: [] })
    }
    expect(i18n.t('places.linkField', { lng: 'en' })).toBe('Google Maps link')
    expect(i18n.t('places.fillIn', { lng: 'de' })).toBe('Übernehmen')
    expect(
      i18n.t('places.errors.link_not_google_maps', { lng: 'de' }),
    ).not.toBe(i18n.t('places.errors.link_not_google_maps', { lng: 'en' }))
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
