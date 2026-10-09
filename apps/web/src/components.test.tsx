/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('T-03-08 uses the category color variable and a translated label', async () => {
    render(<CategoryDot category="must-go" />)
    expect(screen.getByTestId('category-dot')).toHaveAttribute(
      'style',
      expect.stringContaining('var(--cat-must-go)'),
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
    render(<CategoryBadge category="maybe" />)
    expect(screen.getByText('Vielleicht')).toBeInTheDocument()
  })
})
