/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../i18n'
import { SymbolPicker } from './SymbolPicker'

describe('SymbolPicker selection', () => {
  afterEach(cleanup)

  it('T-32-06 rings and checks only the selected symbol', () => {
    render(<SymbolPicker name="Food" symbol="star" onPick={() => {}} />)
    const options = screen.getAllByRole('option')
    const selected = options.filter(
      (o) => o.getAttribute('aria-selected') === 'true',
    )
    expect(selected).toHaveLength(1)
    expect(selected[0]!.dataset.symbol).toBe('star')
    expect(selected[0]!.className).toContain('ring-2')
    expect(selected[0]!.className).toContain('ring-foreground')
    expect(selected[0]!.className).toContain('ring-offset-2')
    expect(selected[0]!.className).toContain('ring-offset-card')
    expect(
      selected[0]!.querySelector('[data-testid="selected-check"]'),
    ).not.toBeNull()
    for (const option of options.filter((o) => o !== selected[0])) {
      expect(option.className).not.toContain('ring-2')
      expect(option.querySelector('[data-testid="selected-check"]')).toBeNull()
    }
    expect(screen.getAllByTestId('selected-check')).toHaveLength(1)
  })
})
