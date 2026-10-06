import { expandTripBBox } from '@tripboard/shared'
import { describe, expect, it } from 'vitest'

const honshu = { minLng: 132, minLat: 34, maxLng: 142, maxLat: 41 }

describe('expandTripBBox', () => {
  it('leaves a spot inside the box unchanged', () => {
    expect(expandTripBBox(honshu, 139.7671, 35.6812)).toBe(honshu)
    expect(expandTripBBox(honshu, 132, 34)).toBe(honshu)
  })

  it('includes an outside point and pads each side by 10% of the new span', () => {
    const next = expandTripBBox(honshu, 127.6809, 26.2124)
    expect(next.minLng).toBeCloseTo(126.24899, 4)
    expect(next.minLat).toBeCloseTo(24.73364, 4)
    expect(next.maxLng).toBeCloseTo(143.43191, 4)
    expect(next.maxLat).toBeCloseTo(42.47876, 4)
    expect(next.minLng).toBeLessThan(127.6809)
    expect(next.minLat).toBeLessThan(26.2124)
  })
})
