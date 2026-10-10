import { spotSchema, type Spot, type SpotImportBody } from '@tripboard/shared'
import { request } from '../api/http'

export async function importSpots(
  tripId: string,
  body: SpotImportBody,
): Promise<{ created: number; spots: Spot[] }> {
  const response = await request(`/api/trips/${tripId}/spots/import`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const json = (await response.json()) as { created: number; spots: unknown[] }
  return {
    created: json.created,
    spots: json.spots.map((spot) => spotSchema.parse(spot)),
  }
}
