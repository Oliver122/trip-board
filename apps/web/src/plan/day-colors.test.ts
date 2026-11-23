import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mapLandColor } from '../map/style'
import { dayColors } from './day-colors'

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

describe('day colours', () => {
  it('T-46-07 the 8 day colours meet 3:1 on the land and 4.5:1 for white numbers, light and dark', () => {
    for (const theme of ['light', 'dark'] as const) {
      const palette = dayColors[theme]
      expect(palette).toHaveLength(8)
      const land = hex(mapLandColor(theme))
      for (const color of palette) {
        expect(contrast(hex(color), land)).toBeGreaterThanOrEqual(3)
        expect(contrast(hex('#ffffff'), hex(color))).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('T-46-07 the --day-1..8 tokens carry the same values in both themes', () => {
    const [light, dark] = splitThemes(css)
    dayColors.light.forEach((color, index) => {
      expect(light).toContain(`--day-${index + 1}: ${color};`)
    })
    dayColors.dark.forEach((color, index) => {
      expect(dark).toContain(`--day-${index + 1}: ${color};`)
    })
  })
})

function splitThemes(source: string): [string, string] {
  const root = /:root\s*\{([^}]*)\}/.exec(source)?.[1] ?? ''
  const dark = /\.dark\s*\{([^}]*)\}/.exec(source)?.[1] ?? ''
  return [root, dark]
}

function hex(value: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(value)
  if (!match?.[1]) throw new Error(value)
  const raw = match[1]
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ]
}

function contrast(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const left = luminance(a)
  const right = luminance(b)
  const [hi, lo] = left > right ? [left, right] : [right, left]
  return (hi + 0.05) / (lo + 0.05)
}

function luminance([r, g, b]: [number, number, number]): number {
  const [red, green, blue] = [r, g, b].map((value) => {
    const channel = value / 255
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
