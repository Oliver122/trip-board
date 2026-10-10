import { z } from 'zod'

/**
 * The one error body every API error reply uses: `{ error: <code>, fields?, ...extra }`.
 * Extras such as `current`, `updatedBy` or `requestId` pass through untouched.
 */
export const apiErrorBodySchema = z
  .object({
    error: z.string(),
    fields: z.record(z.string()).optional(),
  })
  .passthrough()

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>
