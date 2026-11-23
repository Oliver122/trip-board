import type { Photo } from '@tripboard/shared'
import { describe, expect, it } from 'vitest'
import { groupBook, sortPhotos } from './groups'

function photo(id: string, change: Partial<Photo> = {}): Photo {
  return {
    id,
    tripId: 't',
    url: `/images/${id}/file`,
    width: 300,
    height: 200,
    bytes: 1000,
    lat: 35.66,
    lng: 139.7,
    takenAt: '2026-04-13T10:00:00',
    spotId: null,
    spotTitle: null,
    placeSource: 'exif',
    caption: null,
    uploadedBy: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...change,
  }
}

// T-47-05 (R-47-05: day pages in order plus No date)
describe('book grouping', () => {
  const photos = [
    photo('a', {
      takenAt: '2026-04-13T10:15:00',
      spotId: 's1',
      spotTitle: 'Sky',
    }),
    photo('b', { takenAt: '2026-04-13T18:40:00', lat: 35.6655, lng: 139.712 }),
    photo('c', { takenAt: '2026-04-18T08:05:00', lat: 35.0116, lng: 135.7681 }),
    photo('d', { takenAt: null, lat: null, lng: null }),
    photo('e', { takenAt: null }),
    photo('f', {
      takenAt: '2026-04-13T11:00:00',
      spotId: 's1',
      spotTitle: 'Sky',
    }),
  ]
  const book = groupBook(photos)

  it('R-47-06 puts every photo on its day page, an unplaced one in an Not placed yet group, and lists it in notPlaced too', () => {
    const none = book.days.find((day) => day.key === 'none')
    expect(none?.places.map((place) => place.key)).toEqual([
      'unplaced',
      'pt:35.660,139.700',
    ])
    const unplaced = none?.places[0]
    expect(unplaced?.lat).toBeNull()
    expect(unplaced?.photos.map((p) => p.id)).toEqual(['d'])
    expect(book.notPlaced.map((p) => p.id)).toEqual(['d'])
    const dated = groupBook([photo('g', { lat: null, lng: null })])
    expect(dated.days[0]?.key).toBe('2026-04-13')
    expect(dated.days[0]?.places[0]?.key).toBe('unplaced')
  })

  it('R-47-06 makes a page per date in date order, undated last', () => {
    expect(book.days.map((day) => day.key)).toEqual([
      '2026-04-13',
      '2026-04-18',
      'none',
    ])
    expect(book.days.map((day) => day.count)).toEqual([3, 1, 2])
  })

  it('R-47-06 groups a day by place and keeps the spot title', () => {
    const [first] = book.days
    expect(first?.places.map((place) => place.photos.map((p) => p.id))).toEqual(
      [['a', 'f'], ['b']],
    )
    expect(first?.places[0]?.spotTitle).toBe('Sky')
  })

  it('R-47-09 lists photos without a point in notPlaced as well as on the pages', () => {
    expect(book.notPlaced.map((p) => p.id)).toEqual(['d'])
    expect(
      book.days.flatMap((day) => day.places).flatMap((p) => p.photos),
    ).toHaveLength(6)
  })

  it('R-47-03 sorts by capture time, undated last, then creation, then id', () => {
    const sorted = sortPhotos([
      photo('z', { takenAt: null }),
      photo('y', { takenAt: '2026-04-13T10:00:00' }),
      photo('x', { takenAt: '2026-04-12T10:00:00' }),
    ])
    expect(sorted.map((p) => p.id)).toEqual(['x', 'y', 'z'])
  })
})
