/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { SpotKind, Trip, TripRole } from '@tripboard/shared'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import * as client from '../kinds/client'
import { setKinds } from '../kinds/store'
import { TripSettingsPage } from './TripSettingsPage'

const state = vi.hoisted(() => ({ role: 'owner' as string }))

vi.mock('../session', () => ({ useSession: () => ({ reload: vi.fn() }) }))
vi.mock('../kinds/client')
vi.mock('../trips/trip-context', () => ({
  useTripData: () => ({
    trip: {
      id: 'trip-1',
      name: 'Japan',
      role: state.role,
      startDate: null,
      endDate: null,
      updatedAt: '2026-10-11T10:00:00.000Z',
    } as unknown as Trip,
    setTrip: vi.fn(),
  }),
}))

const food: SpotKind = {
  id: 'k3',
  name: 'Food',
  preset: null,
  color: '#D9480F',
  symbol: 'food',
  sortOrder: 0,
  spotCount: 0,
}

function renderPage(role: TripRole, url = '/trips/trip-1/settings') {
  state.role = role
  setKinds('trip-1', [food], 12)
  vi.mocked(client.listKinds).mockResolvedValue({
    kinds: [food],
    limit: 12,
    count: 1,
  })
  vi.mocked(client.latestKindRequest).mockResolvedValue(null)
  render(
    <MemoryRouter initialEntries={[url]}>
      <TripSettingsPage />
    </MemoryRouter>,
  )
}

describe('trip settings kinds section', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('shows the kinds section to admins and owners only', () => {
    for (const role of ['owner', 'admin'] as const) {
      renderPage(role)
      expect(screen.getByTestId('kinds-section')).toBeInTheDocument()
      cleanup()
    }
    for (const role of ['planner', 'visitor'] as const) {
      renderPage(role)
      expect(screen.queryByTestId('kinds-section')).toBeNull()
      expect(screen.getByRole('heading', { name: 'Japan' })).toBeInTheDocument()
      cleanup()
    }
  })

  it('scrolls to #kinds and focuses the heading', async () => {
    renderPage('admin', '/trips/trip-1/settings#kinds')
    const heading = screen.getByRole('heading', { name: 'Spot kinds' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
