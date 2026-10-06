import type { PoolClient } from 'pg'

export type ActivityInput = {
  actor: string | null
  trip: string | null
  action: string
  entityId?: string | null
  metadata?: Record<string, unknown>
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
}

export const activity = { record }
