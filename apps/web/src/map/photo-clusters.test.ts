import { describe, expect, it } from 'vitest'
import { clusterPhotos } from './photo-clusters'
import type { PhotoMapMarker } from '../trips/trip-context'

const world = { minLng: -180, minLat: -85, maxLng: 180, maxLat: 85 }

function photos(count: number): PhotoMapMarker[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p-${index}`,
    lng: 139.7 + (index % 5) * 0.0001,
    lat: 35.6 + Math.floor(index / 5) * 0.0001,
    src: null,
    label: `Photo ${index}`,
  }))
}

describe('clusterPhotos', () => {
  it('T-47-06 clusters only when more than 30 photos are close together', () => {
    expect(clusterPhotos(photos(30), world, 10).map((i) => i.kind)).toEqual(
      Array(30).fill('photo'),
    )
    const items = clusterPhotos(photos(31), world, 10)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'cluster', count: 31 })
  })
})
