import { describe, expect, it } from 'vitest'
import { formatDate, formatTime } from './lib/format'
import { detectLocale } from './lib/locale'

describe('format', () => {
  it('T-03-05 formats a calendar date in the active locale', () => {
    expect(formatDate('2026-04-13', 'en')).toBe('13 Apr 2026')
    expect(formatDate('2026-04-13', 'de')).toBe('13. Apr. 2026')
  })

  it('formats a time with Intl', () => {
    expect(formatTime('2026-04-13T18:00:00.000Z', 'en')).toBe('18:00')
    expect(formatTime('2026-04-13T18:00:00.000Z', 'de')).toBe('18:00')
  })
})

describe('detectLocale', () => {
  it('prefers the profile, then the browser, then English', () => {
    expect(detectLocale('de', ['en-US'])).toBe('de')
    expect(detectLocale(undefined, ['de-AT', 'en'])).toBe('de')
    expect(detectLocale(null, ['fr-FR'])).toBe('en')
    expect(detectLocale(undefined, [])).toBe('en')
  })
})
