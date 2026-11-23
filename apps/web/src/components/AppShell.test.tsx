/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { MoreSheet } from './phone/MoreSheet'
import { ThemeProvider } from '../theme'
import '../i18n'

vi.mock('./Header', () => ({
  Header: ({ tabs }: { tabs?: ReactNode }) => <header>{tabs}</header>,
}))
vi.mock('../comments/useTripUnread', () => ({ useTripUnread: () => 0 }))
vi.mock('../trips/client', () => ({ getTrip: () => new Promise(() => {}) }))

describe('app shell', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('T-31-05 is exactly one viewport tall and never scrolls the page', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/trips/t1']}>
        <AppShell />
      </MemoryRouter>,
    )
    expect(container.firstElementChild).toHaveClass('h-dvh', 'overflow-hidden')
  })

  it('T-47-05 the header lists Photobook right after Schedule', () => {
    render(
      <MemoryRouter initialEntries={['/trips/t1/photos']}>
        <AppShell />
      </MemoryRouter>,
    )
    const links = screen.getAllByRole('link').map((link) => link.textContent)
    const schedule = links.indexOf('Schedule')
    expect(schedule).toBeGreaterThanOrEqual(0)
    expect(links[schedule + 1]).toBe('Photobook')
    expect(screen.getByRole('link', { name: 'Photobook' })).toHaveAttribute(
      'href',
      '/trips/t1/photos',
    )
  })

  it('T-47-05 the More sheet links to the photobook', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    render(
      <ThemeProvider>
        <MemoryRouter>
          <MoreSheet
            tripId="t1"
            unread={0}
            canSeeMembers={false}
            onMembers={() => {}}
            onNews={() => {}}
            onClose={() => {}}
          />
        </MemoryRouter>
      </ThemeProvider>,
    )
    expect(screen.getByTestId('more-photobook')).toHaveAttribute(
      'href',
      '/trips/t1/photos',
    )
  })
})
