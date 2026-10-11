/** @vitest-environment jsdom */
import { kindSymbols, type SpotKindRef } from '@tripboard/shared'
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetTextureState } from '../kinds/textures'
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

describe('Pin textures', () => {
  function useManifest(filled: number[]) {
    // Node's own `localStorage` global can shadow jsdom's, so stub it.
    const stored = JSON.stringify({ version: 'v1', filled })
    vi.stubGlobal('localStorage', { getItem: () => stored })
    resetTextureState()
  }

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    resetTextureState()
  })

  it('T-29-20 a filled symbol shows the texture circle with the kind color ring', () => {
    useManifest([5])
    render(<Pin category="kind" kinds={[food]} label="Spot" />)
    const pin = screen.getByRole('button', { name: 'Spot' })
    const mark = pin.querySelector<HTMLElement>('[data-texture="food"]')
    expect(mark).not.toBeNull()
    expect(mark?.style.backgroundImage).toContain(
      '/textures/kind-symbols.png?v=v1',
    )
    expect(mark?.style.backgroundSize).toBe('800%')
    // Cell 5: column 5, row 0.
    expect(mark?.style.backgroundPosition).toBe(`${(5 * 100) / 7}% 0%`)
    expect(mark?.style.borderRadius).toBe('')
    expect(mark).toHaveClass('rounded-full')
    expect(mark?.style.border).toContain('2px solid')
    expect(mark?.style.border).toContain('rgb(217, 72, 15)')
    expect(pin.querySelector('[data-icon="food"]')).toBeNull()
  })

  it('T-29-20 a symbol outside filled keeps the vector symbol', () => {
    useManifest([11])
    render(<Pin category="kind" kinds={[food]} label="Spot" />)
    const pin = screen.getByRole('button', { name: 'Spot' })
    expect(pin.querySelector('[data-texture]')).toBeNull()
    expect(pin.querySelector('[data-icon="food"]')).not.toBeNull()
  })

  it('T-29-20 two kinds keep the split colors and show the primary texture', () => {
    useManifest([5])
    render(<Pin category="kind" kinds={[food, mustGo]} label="Spot" />)
    const pin = screen.getByRole('button', { name: 'Spot' })
    expect(pin).toHaveAttribute('data-kind-colors', '#D9480F,#E5484D')
    expect(pin.querySelector('[data-half="left"]')).not.toBeNull()
    expect(pin.querySelector('[data-half="right"]')).not.toBeNull()
    expect(pin.querySelector('[data-texture="food"]')).not.toBeNull()
  })

  it('T-29-20 keeps the accessible name and pressed state', () => {
    useManifest([5])
    render(<Pin category="kind" kinds={[food]} label="Ramen" selected />)
    const pin = screen.getByRole('button', { name: 'Ramen' })
    expect(pin).toHaveAttribute('aria-pressed', 'true')
    expect(pin).toHaveClass('is-selected')
  })

  it('T-29-20 planned and home pins never show a texture', () => {
    useManifest([0, 1, 2, 3, 4, 5, 6, 7])
    render(<Pin category="planned" label="Spot" />)
    expect(
      screen
        .getByRole('button', { name: 'Spot' })
        .querySelector('[data-texture]'),
    ).toBeNull()
  })

  it('T-29-20 an empty manifest makes no request and renders as in step 28', () => {
    useManifest([])
    const images: unknown[] = []
    vi.stubGlobal(
      'Image',
      class {
        set src(value: string) {
          images.push(value)
        }
      },
    )
    render(<Pin category="kind" kinds={[food]} label="Spot" />)
    vi.unstubAllGlobals()
    expect(images).toEqual([])
    expect(
      screen
        .getByRole('button', { name: 'Spot' })
        .querySelector('[data-icon="food"]'),
    ).not.toBeNull()
  })

  it('T-29-20 falls back to the vector symbol after the atlas failed to load', () => {
    useManifest([5])
    let fail: (() => void) | undefined
    vi.stubGlobal(
      'Image',
      class {
        set onerror(handler: () => void) {
          fail = handler
        }
        set src(_value: string) {}
      },
    )
    render(<Pin category="kind" kinds={[food]} label="Spot" />)
    vi.unstubAllGlobals()
    const pin = screen.getByRole('button', { name: 'Spot' })
    expect(pin.querySelector('[data-texture]')).not.toBeNull()
    act(() => fail?.())
    expect(pin.querySelector('[data-texture]')).toBeNull()
    expect(pin.querySelector('[data-icon="food"]')).not.toBeNull()
  })
})
