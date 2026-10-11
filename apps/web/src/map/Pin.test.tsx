/** @vitest-environment jsdom */
import { kindSymbols, type SpotKindRef } from '@tripboard/shared'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { Pin } from './Pin'

const mustGo: SpotKindRef = {
  id: '30000000-0000-0000-0000-000000000001',
  name: null,
  preset: 'must_go',
  color: '#E5484D',
  symbol: 'exclamation',
}
const food: SpotKindRef = {
  id: '30000000-0000-0000-0000-000000000002',
  name: 'Food',
  preset: null,
  color: '#D9480F',
  symbol: 'food',
}

describe('Pin', () => {
  afterEach(cleanup)

  it('T-05-04 uses the system color variable and icon for planned and home', () => {
    for (const category of ['planned', 'home'] as const) {
      const { unmount } = render(<Pin category={category} label="Spot" />)
      const pin = screen.getByRole('button', { name: 'Spot' })
      expect(pin.getAttribute('style')).toContain(`var(--cat-${category})`)
      expect(pin.querySelector(`[data-icon="${category}"]`)).not.toBeNull()
      unmount()
    }
  })

  it('T-28-26 one kind: a single color and its symbol', () => {
    render(<Pin category="kind" kinds={[mustGo]} label="Spot" />)
    const pin = screen.getByRole('button', { name: 'Spot' })
    expect(pin.style.backgroundColor).toBe('rgb(229, 72, 77)')
    expect(pin).toHaveAttribute('data-kind-colors', '#E5484D')
    expect(pin.querySelectorAll('[data-half]')).toHaveLength(0)
    expect(pin.querySelector('[data-icon="exclamation"]')).toHaveTextContent(
      '!',
    )
  })

  it('T-28-26 two kinds: primary left, second right, primary symbol', () => {
    render(<Pin category="kind" kinds={[food, mustGo]} label="Spot" />)
    const pin = screen.getByRole('button', { name: 'Spot' })
    expect(pin).toHaveAttribute('data-kind-colors', '#D9480F,#E5484D')
    const left = pin.querySelector<HTMLElement>('[data-half="left"]')
    const right = pin.querySelector<HTMLElement>('[data-half="right"]')
    expect(left?.style.backgroundColor).toBe('rgb(217, 72, 15)')
    expect(right?.style.backgroundColor).toBe('rgb(229, 72, 77)')
    expect(pin.querySelector('[data-icon="food"]')).not.toBeNull()
    expect(pin.querySelector('[data-icon="exclamation"]')).toBeNull()
  })

  it('T-28-26 every symbol key renders an icon', () => {
    for (const symbol of kindSymbols) {
      const { unmount } = render(
        <Pin category="kind" kinds={[{ ...food, symbol }]} label="Spot" />,
      )
      const pin = screen.getByRole('button', { name: 'Spot' })
      expect(pin.querySelector(`[data-icon="${symbol}"]`)).not.toBeNull()
      unmount()
    }
  })

  it('T-12-08 renders a filled house for the primary home base', () => {
    render(<Pin category="home" label="Hotel Gracery" filled />)
    const pin = screen.getByRole('button', { name: 'Hotel Gracery' })
    expect(pin.querySelector('[data-icon="home-filled"]')).not.toBeNull()
    expect(pin.querySelector('[data-icon="home-filled"]')).toHaveAttribute(
      'fill',
      'currentColor',
    )
  })

  it('T-05-04 marks the selected state', () => {
    render(<Pin category="kind" kinds={[mustGo]} label="Spot" selected />)
    expect(screen.getByRole('button', { name: 'Spot' })).toHaveClass(
      'is-selected',
    )
  })

  it('T-24-28 shows a dot on a pin with unread comments only', () => {
    const { unmount } = render(
      <Pin category="kind" kinds={[mustGo]} label="Spot" />,
    )
    expect(screen.queryByTestId('pin-unread')).toBeNull()
    unmount()
    render(<Pin category="kind" kinds={[mustGo]} label="Spot" unread />)
    expect(screen.getByTestId('pin-unread')).toBeInTheDocument()
  })
})
