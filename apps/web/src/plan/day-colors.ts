import { dayColorCount } from '@tripboard/shared'

/**
 * The 8 day colours (R-46-08). Same values as the `--day-1..8` tokens in
 * styles.css; MapLibre line layers cannot read CSS variables, so the map
 * takes the hex value from here and HTML (pins, dots, cards) uses the token.
 */
export const dayColors = {
  light: [
    '#bb251b',
    '#9f470d',
    '#7a5d06',
    '#1c7031',
    '#106d6a',
    '#1460b6',
    '#753dd6',
    '#b0257d',
  ],
  dark: [
    '#d42a1e',
    '#b6510f',
    '#8b6a07',
    '#208038',
    '#127c78',
    '#176dd0',
    '#8451da',
    '#c72a8d',
  ],
} as const satisfies Record<'light' | 'dark', readonly string[]>

/** Hex colour of a day for MapLibre paint properties. */
export function dayColor(colorIndex: number, theme: 'light' | 'dark'): string {
  const palette = dayColors[theme]
  return palette[colorIndex % dayColorCount] ?? palette[0]
}

/** CSS colour of a day for HTML (follows the theme by itself). */
export function dayColorVar(colorIndex: number): string {
  return `var(--day-${(colorIndex % dayColorCount) + 1})`
}
