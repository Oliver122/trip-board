import { describe, expect, it } from 'vitest'
import {
  createSpotSchema,
  normalizeSpotLink,
  patchSpotSchema,
} from '@tripboard/shared'

const spot = {
  title: 'Hotel',
  lat: 35.68,
  lng: 139.76,
  baseCategory: 'maybe',
}

describe('spot links', () => {
  it('T-18-01 accepts a bare host and rejects other schemes', () => {
    expect(normalizeSpotLink('www.hotel.jp')).toEqual({
      link: 'https://www.hotel.jp',
    })
    expect(normalizeSpotLink('HTTP://x.de')).toEqual({ link: 'HTTP://x.de' })
    expect(normalizeSpotLink('   ')).toEqual({ error: 'invalid' })
    expect(normalizeSpotLink('javascript:alert(1)')).toEqual({
      error: 'invalid',
    })
    expect(normalizeSpotLink('ftp://x')).toEqual({ error: 'invalid' })

    expect(createSpotSchema.parse({ ...spot, link: 'www.hotel.jp' }).link).toBe(
      'https://www.hotel.jp',
    )
    expect(patchSpotSchema.parse({ link: 'hotel.jp' }).link).toBe(
      'https://hotel.jp',
    )
    const rejected = createSpotSchema.safeParse({
      ...spot,
      link: 'javascript:alert(1)',
    })
    expect(rejected.success).toBe(false)
    if (!rejected.success) {
      expect(
        rejected.error.issues.some((issue) => issue.message === 'invalid'),
      ).toBe(true)
    }
  })
})
