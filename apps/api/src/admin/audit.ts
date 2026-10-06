import type { PoolClient } from 'pg'

export async function writeAudit(
  tx: PoolClient,
  input: {
    adminId: string
    action: string
    targetUserId?: string | null
    targetTripId?: string | null
    before: unknown
    after: unknown
    reason?: string | null
  },
): Promise<void> {
  await tx.query(
    `
    INSERT INTO admin_audit_log (
      admin_id, action, target_user_id, target_trip_id, before, after, reason
    ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
    `,
    [
      input.adminId,
      input.action,
      input.targetUserId ?? null,
      input.targetTripId ?? null,
      JSON.stringify(input.before),
      JSON.stringify(input.after),
      input.reason ?? null,
    ],
  )
}
