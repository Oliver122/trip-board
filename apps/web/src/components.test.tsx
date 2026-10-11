/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CategoryBadge,
  CategoryDot,
  CategoryStrip,
} from './components/category'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PanelSkeleton,
} from './components/states'
import i18n from './i18n'

describe('state components', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('T-03-08 renders translated defaults', async () => {
    render(<LoadingState />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')

    render(<EmptyState />)
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument()

    const retry = vi.fn()
    render(<ErrorState retry={retry} />)
    expect(
      screen.getByText('Something went wrong. Try again.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()

    cleanup()
    await i18n.changeLanguage('de')
    render(<LoadingState />)
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
    render(<EmptyState />)
    expect(screen.getByText('Hier ist noch nichts.')).toBeInTheDocument()
    render(<ErrorState retry={() => undefined} />)
    expect(
      screen.getByRole('button', { name: 'Erneut versuchen' }),
    ).toBeInTheDocument()
  })

  it('T-26-01 PanelSkeleton is a busy status region', () => {
    render(<PanelSkeleton />)
    const skeleton = screen.getByTestId('panel-skeleton')
    expect(skeleton).toHaveAttribute('role', 'status')
    expect(skeleton).toHaveAttribute('aria-busy', 'true')
    expect(skeleton).toHaveTextContent('Loading…')
  })
})

describe('category components', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  afterEach(cleanup)

  const food = {
    id: '30000000-0000-0000-0000-000000000001',
    name: 'Food',
    preset: null,
    color: '#D9480F',
    symbol: 'food' as const,
  }
  const mustGo = {
    id: '30000000-0000-0000-0000-000000000002',
    name: null,
    preset: 'must_go' as const,
    color: '#E5484D',
    symbol: 'exclamation' as const,
  }

  it('T-03-08 uses the kind color or the system color variable and a translated label', async () => {
    render(<CategoryDot kind={mustGo} />)
    expect(screen.getByTestId('category-dot')).toHaveAttribute(
      'style',
      expect.stringContaining('background-color: rgb(229, 72, 77)'),
    )

    render(<CategoryStrip category="home" />)
    expect(screen.getByTestId('category-strip')).toHaveAttribute(
      'style',
      expect.stringContaining('var(--cat-home)'),
    )

    render(<CategoryBadge category="planned" />)
    expect(screen.getByText('Planned')).toBeInTheDocument()
    expect(screen.getAllByTestId('category-dot').at(-1)).toHaveAttribute(
      'style',
      expect.stringContaining('var(--cat-planned)'),
    )

    await i18n.changeLanguage('de')
    render(
      <CategoryBadge
        category="kind"
        kinds={[{ ...mustGo, preset: 'maybe', name: null }]}
      />,
    )
    expect(screen.getByText('Vielleicht')).toBeInTheDocument()
  })

  it('T-28-26 the strip splits top and bottom for two kinds', () => {
    render(<CategoryStrip category="kind" kinds={[food, mustGo]} />)
    const strip = screen.getByTestId('category-strip')
    expect(strip).toHaveAttribute('data-kind-colors', '#D9480F,#E5484D')
    const halves = strip.querySelectorAll('[data-half]')
    expect([...halves].map((half) => half.getAttribute('data-half'))).toEqual([
      'top',
      'bottom',
    ])
    expect((halves[0] as HTMLElement).style.backgroundColor).toBe(
      'rgb(217, 72, 15)',
    )
    expect((halves[1] as HTMLElement).style.backgroundColor).toBe(
      'rgb(229, 72, 77)',
    )
  })

  it('T-28-26 the strip uses one color for one kind', () => {
    render(<CategoryStrip category="kind" kinds={[food]} />)
    const strip = screen.getByTestId('category-strip')
    expect(strip.querySelectorAll('[data-half]')).toHaveLength(0)
    expect(strip.style.backgroundColor).toBe('rgb(217, 72, 15)')
    expect(strip).toHaveAttribute('data-kind-colors', '#D9480F')
  })

  it('T-28-26 the badge lists both kind names, each with its own dot', () => {
    render(<CategoryBadge category="kind" kinds={[food, mustGo]} />)
    expect(screen.getAllByTestId('category-badge-kind')).toHaveLength(2)
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('Must go')).toBeInTheDocument()
    expect(screen.getAllByTestId('category-dot')).toHaveLength(2)
  })
})
