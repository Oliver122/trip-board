import Supercluster from 'supercluster'
import type { PhotoMapMarker } from '../trips/trip-context'
import type { LngLatBounds } from './bounds'
import { clusterMinPoints } from './clusters'

type ClusteredPhoto =
  | { kind: 'photo'; photo: PhotoMapMarker }
  | { kind: 'cluster'; id: number; lng: number; lat: number; count: number }

/** Photos cluster like spots (C-MAP-11) but in their own index, never together. */
export function clusterPhotos(
  photos: PhotoMapMarker[],
  bounds: LngLatBounds,
  zoom: number,
): ClusteredPhoto[] {
  const index = new Supercluster<PhotoMapMarker>({
    radius: 60,
    maxZoom: 16,
    minPoints: clusterMinPoints,
  })
  index.load(
    photos.map((photo) => ({
      type: 'Feature' as const,
      properties: photo,
      geometry: {
        type: 'Point' as const,
        coordinates: [photo.lng, photo.lat] as [number, number],
      },
    })),
  )
  const west = Math.min(bounds.minLng, bounds.maxLng)
  const east = Math.max(bounds.minLng, bounds.maxLng)
  const south = Math.min(bounds.minLat, bounds.maxLat)
  const north = Math.max(bounds.minLat, bounds.maxLat)
  return index
    .getClusters([west, south, east, north], Math.max(0, Math.floor(zoom)))
    .map((feature): ClusteredPhoto => {
      const [lng, lat] = feature.geometry.coordinates
      const props = feature.properties as PhotoMapMarker & {
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
      return { kind: 'photo', photo: props }
    })
}
