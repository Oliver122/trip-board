import { nominatimViewbox } from '@tripboard/shared'
import { describe, expect, it } from 'vitest'

describe('nominatimViewbox', () => {
  it('T-06-10 orders the box as left, top, right, bottom', () => {
    expect(
      nominatimViewbox({
        minLng: 130,
        minLat: 34,
        maxLng: 142,
        maxLat: 41,
      }),
    ).toBe('130,41,142,34')
  })
})
