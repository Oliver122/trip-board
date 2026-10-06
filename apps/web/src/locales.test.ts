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
