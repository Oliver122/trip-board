import { z } from 'zod'

export const inviteRoles = ['planner', 'visitor'] as const
export const inviteRoleSchema = z.enum(inviteRoles)
export type InviteRole = z.infer<typeof inviteRoleSchema>

export const inviteCodePattern = /^[A-Z0-9]{3}-[A-Z0-9]{4}$/

export const createInviteSchema = z
  .object({
    role: inviteRoleSchema.optional(),
  })
  .strict()

export type CreateInviteBody = z.infer<typeof createInviteSchema>

export const memberSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.enum(['visitor', 'planner', 'owner']),
})

export type Member = z.infer<typeof memberSchema>

export const memberListSchema = z.object({
  members: z.array(memberSchema),
})

export const inviteSchema = z.object({
  id: z.string().uuid(),
  code: z.string().regex(inviteCodePattern),
  role: inviteRoleSchema,
  expiresAt: z.string().datetime(),
  uses: z.number().int().nonnegative(),
})

export type TripInvite = z.infer<typeof inviteSchema>

export const inviteListSchema = z.object({
  invites: z.array(inviteSchema),
})

export const joinPreviewSchema = z.object({
  tripId: z.string().uuid(),
  tripName: z.string(),
  ownerName: z.string(),
  memberCount: z.number().int().nonnegative(),
  role: inviteRoleSchema,
})

export type JoinPreview = z.infer<typeof joinPreviewSchema>

export const joinResultSchema = z.object({
  tripId: z.string().uuid(),
})

export const transferOwnershipSchema = z
  .object({
    userId: z.string().uuid({ message: 'invalid' }),
  })
  .strict()

export type TransferOwnershipBody = z.infer<typeof transferOwnershipSchema>

export const patchMemberSchema = z
  .object({
    role: inviteRoleSchema,
  })
  .strict()

export type PatchMemberBody = z.infer<typeof patchMemberSchema>
