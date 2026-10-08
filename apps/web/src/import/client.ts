import { spotSchema, type Spot, type SpotImportBody } from '@tripboard/shared'
import { writeInit } from '../api/write'
import { AuthError } from '../trips/client'
import { SaveError } from '../spots/client'

export async function importSpots(
  tripId: string,
  body: SpotImportBody,
): Promise<{ created: number; spots: Spot[] }> {
  const response = await fetch(`/api/trips/${tripId}/spots/import`, {
    ...writeInit({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    credentials: 'include',
  })
  if (response.status === 401) throw new AuthError()
  if (!response.ok) throw await saveError(response)
  const json = (await response.json()) as { created: number; spots: unknown[] }
  return {
    created: json.created,
    spots: json.spots.map((spot) => spotSchema.parse(spot)),
  }
}

async function saveError(response: Response): Promise<SaveError> {
  let fields: Record<string, string> = {}
  try {
    const body = (await response.json()) as { fields?: unknown }
    if (body.fields && typeof body.fields === 'object') {
      fields = Object.fromEntries(
        Object.entries(body.fields).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    }
  } catch {
    /* empty body */
  }
  return new SaveError(response.status, fields)
}
