/** @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

vi.mock('./Header', () => ({ Header: () => <header /> }))
vi.mock('../comments/useTripUnread', () => ({ useTripUnread: () => 0 }))
vi.mock('../trips/client', () => ({ getTrip: () => new Promise(() => {}) }))

describe('app shell', () => {
  afterEach(cleanup)

  it('T-31-05 is exactly one viewport tall and never scrolls the page', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/trips/t1']}>
        <AppShell />
      </MemoryRouter>,
    )
    expect(container.firstElementChild).toHaveClass('h-dvh', 'overflow-hidden')
  })
})
