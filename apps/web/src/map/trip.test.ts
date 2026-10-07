import { describe, expect, it } from 'vitest'
import { parseTrip } from './trip'

const trip = {
  id: '10000000-0000-0000-0000-000000000001',
  name: 'Japan 2026',
  role: 'owner',
  memberCount: 3,
  createdByName: 'Sven',
  startDate: '2026-04-12',
  endDate: '2026-04-24',
  timezone: 'Asia/Tokyo',
  region: {
    bbox: { minLng: 122.9, minLat: 24, maxLng: 153.9, maxLat: 45.6 },
  },
  members: [],
  unreadComments: 0,
}

describe('parseTrip', () => {
  it('reads the trip bbox from the trip payload', () => {
    expect(parseTrip(trip)?.bbox).toEqual({
      minLng: 122.9,
      minLat: 24,
      maxLng: 153.9,
      maxLat: 45.6,
    })
  })

  it('rejects a payload without a region', () => {
    expect(parseTrip({ id: trip.id, name: trip.name })).toBeNull()
  })
})
