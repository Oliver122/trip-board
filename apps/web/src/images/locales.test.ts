import { webImageErrorCodes } from '@tripboard/shared'
import { describe, expect, it } from 'vitest'
import i18n from '../i18n'

describe('image locales', () => {
  it('T-34-13 has the step 34 keys in en and de', () => {
    const keys = [
      ...webImageErrorCodes.map((code) => `images.errors.${code}`),
      'images.errors.too_large',
      'images.errors.unsupported_type',
      'images.errors.rate_limited',
      'images.errors.invalid_url',
      'images.webFindOnGoogle',
      'images.webNotAnImage',
      'images.webPasteHint',
      'images.webSource',
      'images.webCredit',
      'images.suggestionsTitle',
      'images.suggestionsLoading',
      'images.suggestionsEmpty',
      'images.suggestionsError',
      'images.suggestionsRetry',
      'images.suggestionsFooter',
      'images.suggestionsBy',
      'images.suggestionsAdd',
      'images.suggestionsAdding',
      'images.suggestionsAddLabel',
      'images.draftTitle',
      'images.queueRemove',
      'images.queueFull',
      'images.queueFailed_one',
      'images.queueFailed_other',
    ]
    for (const lng of ['en', 'de'] as const) {
      const missing = keys.filter((key) => !i18n.exists(key, { lng }))
      expect({ lng, missing }).toEqual({ lng, missing: [] })
    }
    expect(
      i18n.t('images.queueFailed', { count: 1, details: 'x', lng: 'en' }),
    ).toBe('Spot added. 1 photo could not be added: x')
  })
})
