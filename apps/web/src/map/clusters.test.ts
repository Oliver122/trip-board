import { describe, expect, it } from 'vitest'
import { clusterSpots, type MapSpot } from './clusters'

describe('clusterSpots', () => {
  it('clusters only when more than 30 points are close together', () => {
    const tight: MapSpot[] = Array.from({ length: 31 }, (_, index) => ({
      id: `tight-${index}`,
      title: 'Tight',
      subtitle: '',
      category: 'planned',
      kinds: [],
      lng: 139.7 + (index % 5) * 0.0001,
      lat: 35.6 + Math.floor(index / 5) * 0.0001,
    }))
    const spread: MapSpot[] = Array.from({ length: 30 }, (_, index) => ({
      id: `spread-${index}`,
      title: 'Spread',
      subtitle: '',
      category: 'home',
      kinds: [],
      lng: index,
      lat: 0,
    }))

    const result = clusterSpots(
      [...tight, ...spread],
      { minLng: -1, minLat: -1, maxLng: 180, maxLat: 80 },
      10,
    )
    const clusters = result.filter((item) => item.kind === 'cluster')
    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toMatchObject({ count: 31 })
    expect(result.filter((item) => item.kind === 'spot')).toHaveLength(30)
  })
})
