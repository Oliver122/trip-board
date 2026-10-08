import type { PoolClient } from 'pg'
import { currentClientId } from './client.js'

const liveResources = new Set([
  'spot',
  'image',
  'plan',
  'home',
  'member',
  'trip',
  'comment',
])

export type ActivityInput = {
  actor: string | null
  trip: string | null
  action: string
  entityId?: string | null
  metadata?: Record<string, unknown>
  resource?: string
}

export async function record(
  tx: PoolClient,
  input: ActivityInput,
): Promise<void> {
  await tx.query(
    `
    INSERT INTO activity_events (actor_id, trip_id, action, entity_id, metadata)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      input.actor,
      input.trip,
      input.action,
      input.entityId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  )
  const resource = resourceFor(input.action, input.resource)
  if (!input.trip || !resource) return
  const payload = JSON.stringify({
    tripId: input.trip,
    resource,
    id: input.entityId ?? null,
    action: input.action,
    actorId: input.actor,
    clientId: currentClientId(),
  })
  await tx.query(`SELECT pg_notify('trip_events', $1)`, [payload])
}

function resourceFor(action: string, explicit?: string): string | null {
  if (explicit && liveResources.has(explicit)) return explicit
  const prefix = action.split('.')[0] ?? ''
  if (prefix === 'invite') return 'member'
  if (liveResources.has(prefix)) return prefix
  return null
}

export const activity = { record }
