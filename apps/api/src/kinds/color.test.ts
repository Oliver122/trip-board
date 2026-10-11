import { kindColorError, kindSwatches } from '@tripboard/shared'
import { describe, expect, it } from 'vitest'

describe('kind colors', () => {
  it('T-28-08 accepts the swatches and rejects low contrast and reserved colors', () => {
    for (const swatch of kindSwatches) expect(kindColorError(swatch)).toBeNull()
    expect(kindSwatches).toHaveLength(10)
    expect(kindColorError('#E5484D')).toBeNull()
    expect(kindColorError('#FFE066')).toBe('kind_color_contrast')
    expect(kindColorError('#FFFFFF')).toBe('kind_color_contrast')
    for (const reserved of ['#3E63DD', '#3e63dd', '#F5A524', '#f5a524']) {
      expect(kindColorError(reserved)).toBe('kind_color_reserved')
    }
    expect(kindColorError('red')).toBe('invalid')
  })
})
