import Supercluster from 'supercluster'
import type { Category } from '../components/category'
import type { LngLatBounds } from './bounds'

export const clusterMinPoints = 31

export type MapSpot = {
  id: string
  title: string
  subtitle: string
  category: Category
  lng: number
  lat: number
  primary?: boolean
}

export type ClusteredSpot =
  | { kind: 'spot'; spot: MapSpot }
  | { kind: 'cluster'; id: number; lng: number; lat: number; count: number }

type SpotProps = MapSpot

export function clusterSpots(
  spots: MapSpot[],
  bounds: LngLatBounds,
  zoom: number,
): ClusteredSpot[] {
  const index = new Supercluster<SpotProps>({
    radius: 60,
    maxZoom: 16,
    minPoints: clusterMinPoints,
  })
  index.load(
    spots.map((spot) => ({
      type: 'Feature' as const,
      properties: spot,
      geometry: {
        type: 'Point' as const,
        coordinates: [spot.lng, spot.lat] as [number, number],
      },
    })),
  )
  const west = Math.min(bounds.minLng, bounds.maxLng)
  const east = Math.max(bounds.minLng, bounds.maxLng)
  const south = Math.min(bounds.minLat, bounds.maxLat)
  const north = Math.max(bounds.minLat, bounds.maxLat)
  return index
    .getClusters([west, south, east, north], Math.max(0, Math.floor(zoom)))
    .map((feature): ClusteredSpot => {
      const [lng, lat] = feature.geometry.coordinates
      const props = feature.properties as SpotProps & {
        cluster?: boolean
        cluster_id?: number
        point_count?: number
      }
      if (props.cluster) {
        return {
          kind: 'cluster',
          id: props.cluster_id ?? 0,
          lng: lng ?? 0,
          lat: lat ?? 0,
          count: props.point_count ?? 0,
        }
      }
      return { kind: 'spot', spot: props }
    })
}
