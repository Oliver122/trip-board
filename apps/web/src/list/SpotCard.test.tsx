/** @vitest-environment jsdom */
import type { Spot } from '@tripboard/shared'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { SpotCard } from './SpotCard'

const base: Spot = {
  id: '20000000-0000-0000-0000-000000000003',
  tripId: '10000000-0000-0000-0000-000000000001',
  title: 'teamLab Borderless',
  address: 'Azabudai',
  lat: 35.66,
  lng: 139.74,
  baseCategory: 'kind',
  displayCategory: 'planned',
  kinds: [],
  planCount: 1,
  firstScheduledAt: '2026-04-14T00:00:00',
  stayFrom: null,
  stayTo: null,
  primary: false,
  info: null,
  link: null,
  createdBy: null,
  commentCount: 0,
  unreadComments: 0,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
}

function renderCard(spot: Spot, locale: 'en' | 'de') {
  render(
    <SpotCard
      spot={spot}
      locale={locale}
      phone={false}
      selected={false}
      onSelect={() => undefined}
      onHover={() => undefined}
    />,
  )
}

describe('SpotCard', () => {
  afterEach(cleanup)

  it('T-42-08 shows a visit without a time as a date only (en)', async () => {
    await i18n.changeLanguage('en')
    renderCard(base, 'en')
    expect(screen.getByText('Planned · 14 Apr 2026')).toBeInTheDocument()
    expect(screen.queryByText(/00:00/)).toBeNull()
  })

  it('T-42-08 shows a visit without a time as a date only (de)', async () => {
    await i18n.changeLanguage('de')
    renderCard(base, 'de')
    expect(screen.getByText(/^Geplant · 14\. Apr\. 2026$/)).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })

  it('T-42-08 keeps the time and names a home', async () => {
    await i18n.changeLanguage('en')
    renderCard({ ...base, firstScheduledAt: '2026-04-14T18:00:00' }, 'en')
    expect(
      screen.getByText(/^Planned · 14 Apr 2026 18:00$/),
    ).toBeInTheDocument()
    cleanup()
    renderCard(
      { ...base, displayCategory: 'home', firstScheduledAt: null },
      'en',
    )
    expect(screen.getByText('Home · Azabudai')).toBeInTheDocument()
  })
})
