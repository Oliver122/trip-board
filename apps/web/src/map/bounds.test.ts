import { describe, expect, it } from 'vitest'
import { maxBoundsFor } from './bounds'

describe('maxBoundsFor', () => {
  it('T-05-01 adds a 50% margin on every side', () => {
    expect(
      maxBoundsFor({ minLng: 10, minLat: 20, maxLng: 30, maxLat: 40 }),
    ).toEqual({
      minLng: 0,
      minLat: 10,
      maxLng: 40,
      maxLat: 50,
    })
  })

  it('T-05-01 clamps the margin to world limits', () => {
    expect(
      maxBoundsFor({ minLng: -170, minLat: -85, maxLng: -150, maxLat: -70 }),
    ).toEqual({
      minLng: -180,
      minLat: -90,
      maxLng: -140,
      maxLat: -62.5,
    })
    expect(
      maxBoundsFor({ minLng: 160, minLat: 80, maxLng: 175, maxLat: 88 }),
    ).toEqual({
      minLng: 152.5,
      minLat: 76,
      maxLng: 180,
      maxLat: 90,
    })
  })
})
