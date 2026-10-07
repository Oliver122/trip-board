/** @vitest-environment jsdom */
import {
  defaultSpotListQuery,
  type Spot,
  type SpotListQuery,
} from '@tripboard/shared'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { SpotList } from './SpotList'

const kyoto: Spot = {
  id: '20000000-0000-0000-0000-000000000003',
  tripId: '10000000-0000-0000-0000-000000000001',
  title: 'Fushimi Inari',
  address: 'Kyoto',
  lat: 34.967,
  lng: 135.772,
  baseCategory: 'must_go',
  displayCategory: 'must_go',
  planCount: 0,
  firstScheduledAt: null,
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

function renderList(
  spots: Spot[],
  extra: {
    total?: number
    bounds?: {
      minLng: number
      minLat: number
      maxLng: number
      maxLat: number
    } | null
    query?: SpotListQuery
  } = {},
) {
  render(
    <SpotList
      tripId="10000000-0000-0000-0000-000000000001"
      tripName="Japan 2026"
      timeZone="Asia/Tokyo"
      spots={spots}
      total={extra.total ?? spots.length}
      bounds={extra.bounds === undefined ? null : extra.bounds}
      query={extra.query ?? defaultSpotListQuery}
      members={[]}
      searchDraft=""
      onSearchDraft={() => undefined}
      onQuery={() => undefined}
      selectedId={null}
      onSelect={() => undefined}
      onHover={() => undefined}
    />,
  )
}

describe('SpotList empty states', () => {
  beforeEach(async () => {
    cleanup()
    await i18n.changeLanguage('en')
  })

  it('shows a scheduled time as the trip wall clock', () => {
    renderList([{ ...kyoto, firstScheduledAt: '2026-04-13T18:00:00' }])
    expect(screen.getByText('13 Apr 2026 18:00')).toBeInTheDocument()
    expect(screen.getByTestId('spot-count')).toHaveTextContent('1 spot')
  })

  it('T-07-10 shows the trip empty state when there are no spots', () => {
    renderList([])
    expect(
      screen.getByText('No spots yet — add your first one'),
    ).toBeInTheDocument()
  })

  it('T-07-10 shows the viewport empty state when nothing is in view', () => {
    renderList([kyoto], {
      bounds: { minLng: 139, minLat: 35, maxLng: 140, maxLat: 36 },
      query: { ...defaultSpotListQuery, visible: true },
    })
    expect(
      screen.getByText(
        "Nothing here — zoom out or turn off 'only visible on map'",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Fushimi Inari')).not.toBeInTheDocument()
  })

  it('shows scheduled spots, then the divider, then the rest', () => {
    const shibuya: Spot = {
      ...kyoto,
      id: '20000000-0000-0000-0000-000000000001',
      title: 'Shibuya Sky',
      displayCategory: 'planned',
      planCount: 1,
      firstScheduledAt: '2026-04-13T18:00:00',
    }
    renderList([shibuya, kyoto], { total: 2 })
    const list = screen.getByTestId('spot-list')
    const order = [
      ...list.querySelectorAll(
        '[data-testid^="card-"], [data-testid="unscheduled-divider"]',
      ),
    ].map((node) => node.getAttribute('data-testid'))
    expect(order).toEqual([
      `card-${shibuya.id}`,
      'unscheduled-divider',
      `card-${kyoto.id}`,
    ])
    expect(screen.getByText('Not scheduled yet')).toBeInTheDocument()
  })

  it('shows n of m and the filter empty state', () => {
    renderList([], {
      total: 6,
      query: { ...defaultSpotListQuery, q: 'zzzz' },
    })
    expect(screen.getByTestId('spot-count')).toHaveTextContent('0 of 6 spots')
    expect(screen.getByText('No spots match your filters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
  })
})
