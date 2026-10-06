import { tripSchema, type Trip, type TripRole } from '@tripboard/shared'
import type { LngLatBounds } from './bounds'

export type TripMapData = {
  id: string
  name: string
  role: TripRole
  bbox: LngLatBounds
  members: Trip['members']
}

export function parseTrip(body: unknown): TripMapData | null {
  const parsed = tripSchema.safeParse(body)
  if (!parsed.success) return null
  const { bbox } = parsed.data.region
  if (bbox.minLng > bbox.maxLng || bbox.minLat > bbox.maxLat) return null
  return {
    id: parsed.data.id,
    name: parsed.data.name,
    role: parsed.data.role,
    bbox,
    members: parsed.data.members,
  }
}
