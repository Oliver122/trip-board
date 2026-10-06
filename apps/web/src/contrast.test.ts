import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('danger contrast', () => {
  it('T-20-06 keeps danger text and solid buttons at 4.5:1', () => {
    expect(css).toContain('--danger: #b91c1c')
    expect(css).toContain('--danger: #f87171')
    expect(css).toContain('--danger-solid: #b91c1c')
    expect(css).toContain('--danger-solid: #dc2626')
    expect(css).toContain('--danger-soft: #fef2f2')
    expect(css).toContain('--hover: #f4f4f5')
    expect(css).toContain('--hover: #27272a')

    expect(contrast(hex('#b91c1c'), hex('#fafafa'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex('#b91c1c'), hex('#ffffff'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex('#b91c1c'), hex('#fef2f2'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex('#ffffff'), hex('#b91c1c'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex('#f87171'), hex('#09090b'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex('#f87171'), hex('#18181b'))).toBeGreaterThanOrEqual(4.5)
    const softDark = composite(hex('#09090b'), [248, 113, 113], 0.12)
    expect(contrast(hex('#f87171'), softDark)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex('#ffffff'), hex('#dc2626'))).toBeGreaterThanOrEqual(4.5)
  })
})

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

function composite(
  base: [number, number, number],
  over: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    over[0] * alpha + base[0] * (1 - alpha),
    over[1] * alpha + base[1] * (1 - alpha),
    over[2] * alpha + base[2] * (1 - alpha),
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

function luminance([red, green, blue]: [number, number, number]): number {
  const channel = (value: number) => {
    const scaled = value / 255
    return scaled <= 0.04045
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
  )
}
