/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { kindSwatches } from '@tripboard/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { ColorSwatches } from './ColorSwatches'

describe('ColorSwatches selection', () => {
  afterEach(cleanup)

  it('T-32-06 rings and checks only the pressed swatch', () => {
    const color = kindSwatches[2]!
    render(<ColorSwatches value={color.toLowerCase()} onPick={() => {}} />)
    const swatches = screen.getAllByTestId('kind-color-swatch')
    const pressed = swatches.filter(
      (s) => s.getAttribute('aria-pressed') === 'true',
    )
    expect(pressed).toHaveLength(1)
    expect(pressed[0]!.getAttribute('aria-label')).toBe(color)
    expect(pressed[0]!.className).toContain('ring-2')
    expect(pressed[0]!.className).toContain('ring-foreground')
    expect(pressed[0]!.className).toContain('ring-offset-2')
    expect(pressed[0]!.className).toContain('ring-offset-card')
    expect(
      pressed[0]!.querySelector('[data-testid="selected-check"]'),
    ).not.toBeNull()
    for (const swatch of swatches.filter((s) => s !== pressed[0])) {
      expect(swatch.className).not.toContain('ring-2')
      expect(swatch.querySelector('[data-testid="selected-check"]')).toBeNull()
    }
  })
})
