import { z } from 'zod'

const optionalText = z
  .string()
  .optional()
  .transform((value) => (value === '' ? undefined : value))

export const adminUserSorts = [
  'username',
  'discordId',
  'displayName',
  'role',
  'createdAt',
  'lastLoginAt',
  'lastSeenAt',
  'lastActivityAt',
  'suspendedAt',
  'tripsMember',
  'tripsOwned',
  'spotsCreated',
  'usedImages',
  'usedBytes',
  'maxImages',
  'maxBytes',
  'events30d',
] as const

export const adminUserFilters = [
  'admins',
  'suspended',
  'quota',
  'inactive',
] as const

export const adminTripSorts = [
  'name',
  'createdAt',
  'members',
  'spots',
  'planEntries',
  'images',
  'imageBytes',
  'lastActivityAt',
] as const

export const adminUserSchema = z.object({
  id: z.string().uuid(),
  discordId: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  appRole: z.enum(['user', 'admin']),
  createdAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  suspendedAt: z.string().datetime().nullable(),
  usedImages: z.number().int().nonnegative(),
  maxImages: z.number().int().nonnegative(),
  usedBytes: z.number().int().nonnegative(),
  maxBytes: z.number().int().nonnegative(),
  hasOverride: z.boolean(),
  tripsMember: z.number().int().nonnegative(),
  tripsOwned: z.number().int().nonnegative(),
  spotsCreated: z.number().int().nonnegative(),
  events30d: z.number().int().nonnegative(),
  lastActivityAt: z.string().datetime().nullable(),
})

export type AdminUser = z.infer<typeof adminUserSchema>

export const adminUserListSchema = z.object({
  users: z.array(adminUserSchema),
  nextCursor: z.string().nullable(),
})

export const adminActionSchema = z.object({
  id: z.number().int(),
  action: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  actorId: z.string().uuid().nullable(),
  actorName: z.string().nullable(),
  tripId: z.string().uuid().nullable(),
  tripName: z.string().nullable(),
})

export type AdminAction = z.infer<typeof adminActionSchema>

export const quotaRequestSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
  requestedImages: z.number().int().positive().nullable(),
  requestedBytes: z.number().int().positive().nullable(),
  message: z.string().nullable(),
  status: z.enum(['pending', 'approved', 'rejected']),
  decisionNote: z.string().nullable(),
  decidedBy: z.string().uuid().nullable(),
  decidedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  usedImages: z.number().int().nonnegative(),
  maxImages: z.number().int().nonnegative(),
  usedBytes: z.number().int().nonnegative(),
  maxBytes: z.number().int().nonnegative(),
})

export type QuotaRequest = z.infer<typeof quotaRequestSchema>

export const quotaRequestListSchema = z.object({
  requests: z.array(quotaRequestSchema),
  pendingCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
})

export const adminUserDetailSchema = z.object({
  user: adminUserSchema,
  suspendedReason: z.string().nullable(),
  defaults: z.object({
    maxImages: z.number().int().nonnegative(),
    maxBytes: z.number().int().nonnegative(),
  }),
  trips: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      role: z.enum(['owner', 'admin', 'planner', 'visitor']),
    }),
  ),
  actions: z.array(adminActionSchema),
  quotaRequests: z.array(quotaRequestSchema),
  sparkline: z.array(z.number().int().nonnegative()).length(30),
})

export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>

export const adminTripSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid().nullable(),
  ownerId: z.string().uuid().nullable(),
  ownerName: z.string().nullable(),
  members: z.number().int().nonnegative(),
  spots: z.number().int().nonnegative(),
  planEntries: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
  imageBytes: z.number().int().nonnegative(),
  lastActivityAt: z.string().datetime().nullable(),
})

export type AdminTrip = z.infer<typeof adminTripSchema>

export const adminTripListSchema = z.object({
  trips: z.array(adminTripSchema),
  nextCursor: z.string().nullable(),
})

export const adminTripDetailSchema = z.object({
  trip: adminTripSchema,
  members: z.array(
    z.object({
      id: z.string().uuid(),
      username: z.string(),
      displayName: z.string().nullable(),
      role: z.enum(['owner', 'admin', 'planner', 'visitor']),
    }),
  ),
  actions: z.array(adminActionSchema),
  sparkline: z.array(z.number().int().nonnegative()).length(30),
  kindLimit: z.lazy(() => adminKindLimitSchema),
})

export type AdminTripDetail = z.infer<typeof adminTripDetailSchema>

export const appSettingsSchema = z.object({
  defaultMaxImages: z.number().int().nonnegative(),
  defaultMaxBytes: z.number().int().nonnegative(),
  dbCapacityBytes: z.number().int().positive(),
  blobCapacityBytes: z.number().int().positive(),
  capacityWarnPct: z.number().int().min(1).max(100),
  uploadsEnabled: z.boolean(),
  signupsEnabled: z.boolean(),
  /** R-29-07: kinds per trip unless the trip has an override. */
  defaultMaxKinds: z.number().int().min(1).max(64),
})

export type AppSettings = z.infer<typeof appSettingsSchema>

export const auditEntrySchema = z.object({
  id: z.number().int(),
  adminId: z.string().uuid().nullable(),
  adminName: z.string().nullable(),
  action: z.string(),
  targetUserId: z.string().uuid().nullable(),
  targetUserName: z.string().nullable(),
  targetTripId: z.string().uuid().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export type AuditEntry = z.infer<typeof auditEntrySchema>

export const auditListSchema = z.object({
  entries: z.array(auditEntrySchema),
  nextCursor: z.string().nullable(),
})

const reasonSchema = z.string().trim().max(500)

export const quotaPatchSchema = z
  .object({
    maxImages: z.number().int().nonnegative().optional(),
    maxBytes: z.number().int().nonnegative().optional(),
    reset: z.boolean().optional(),
    reason: reasonSchema.optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.reset === true ||
      body.maxImages !== undefined ||
      body.maxBytes !== undefined,
    { message: 'empty' },
  )

export type QuotaPatch = z.infer<typeof quotaPatchSchema>

export const suspendSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export const rolePatchSchema = z
  .object({
    appRole: z.enum(['user', 'admin']),
  })
  .strict()

export const quotaRequestCreateSchema = z
  .object({
    images: z.number().int().positive().optional(),
    bytes: z.number().int().positive().optional(),
    message: reasonSchema.optional(),
  })
  .strict()
  .refine((body) => body.images !== undefined || body.bytes !== undefined, {
    message: 'empty',
  })

export type QuotaRequestCreate = z.infer<typeof quotaRequestCreateSchema>

export const quotaApproveSchema = z
  .object({
    images: z.number().int().positive().optional(),
    bytes: z.number().int().positive().optional(),
    note: reasonSchema.optional(),
  })
  .strict()

export type QuotaApprove = z.infer<typeof quotaApproveSchema>

export const quotaRejectSchema = z
  .object({
    note: reasonSchema.optional(),
  })
  .strict()

export const settingsPatchSchema = appSettingsSchema
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'empty' })

export type SettingsPatch = z.infer<typeof settingsPatchSchema>

export const userListQuerySchema = z.object({
  q: optionalText,
  filter: z.enum(adminUserFilters).optional(),
  sort: z.enum(adminUserSorts).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  cursor: optionalText,
})

export const tripListQuerySchema = z.object({
  q: optionalText,
  sort: z.enum(adminTripSorts).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  cursor: optionalText,
})

export const auditQuerySchema = z.object({
  admin: z.string().uuid().optional(),
  target: z.string().uuid().optional(),
  action: optionalText,
  cursor: optionalText,
})

export const requestListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  cursor: optionalText,
})

export const statsRanges = ['7d', '30d', '90d', 'all'] as const

export const statsQuerySchema = z.object({
  range: z.enum(statsRanges).default('30d'),
})

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const metricsQuerySchema = z.object({
  from: daySchema,
  to: daySchema,
})

export const activityActionFilter = z
  .string()
  .regex(/^[a-z_]+(\.[a-z_]+|\.\*)$/)

export const activityQuerySchema = z.object({
  user: z.string().uuid().optional(),
  trip: z.string().uuid().optional(),
  action: activityActionFilter.optional(),
  from: daySchema.optional(),
  to: daySchema.optional(),
  cursor: optionalText,
})

export const adminStatsSchema = z.object({
  range: z.enum(statsRanges),
  usersTotal: z.number().int().nonnegative(),
  usersNew: z.number().int().nonnegative(),
  active24h: z.number().int().nonnegative(),
  active7d: z.number().int().nonnegative(),
  active30d: z.number().int().nonnegative(),
  tripsTotal: z.number().int().nonnegative(),
  tripsNew: z.number().int().nonnegative(),
  spotsTotal: z.number().int().nonnegative(),
  imagesTotal: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  dbBytes: z.number().int().nonnegative(),
  dbCapacityBytes: z.number().int().positive(),
  blobBytes: z.number().int().nonnegative(),
  blobCapacityBytes: z.number().int().positive(),
  capacityWarnPct: z.number().int().min(1).max(100),
  warning: z.enum(['db', 'blob']).nullable(),
  level: z.enum(['amber', 'red']).nullable(),
})

export type AdminStats = z.infer<typeof adminStatsSchema>

export const metricDaySchema = z.object({
  day: daySchema,
  usersTotal: z.number().int().nonnegative(),
  usersNew: z.number().int().nonnegative(),
  usersActive: z.number().int().nonnegative(),
  tripsTotal: z.number().int().nonnegative(),
  spotsTotal: z.number().int().nonnegative(),
  planEntriesTotal: z.number().int().nonnegative(),
  imagesTotal: z.number().int().nonnegative(),
  imageBytesTotal: z.number().int().nonnegative(),
  dbBytes: z.number().int().nonnegative(),
  eventsTotal: z.number().int().nonnegative(),
})

export const metricsSeriesSchema = z.object({
  day: daySchema,
  spots: z.number().int().nonnegative(),
  plans: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
  other: z.number().int().nonnegative(),
})

export const storageRankSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  bytes: z.number().int().nonnegative(),
})

export const activityRankSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  events: z.number().int().nonnegative(),
})

export const adminMetricsSchema = z.object({
  days: z.array(metricDaySchema),
  activity: z.array(metricsSeriesSchema),
  topUsers: z.array(storageRankSchema),
  topTrips: z.array(activityRankSchema),
})

export type AdminMetrics = z.infer<typeof adminMetricsSchema>

export const activityEventSchema = adminActionSchema

export const activityListSchema = z.object({
  events: z.array(activityEventSchema),
  nextCursor: z.string().nullable(),
})

export type ActivityEvent = z.infer<typeof activityEventSchema>

export const tableSizeSchema = z.object({
  name: z.string(),
  tableBytes: z.number().int().nonnegative(),
  indexBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  estimatedRows: z.number().int().nonnegative(),
})

export const adminStorageSchema = z.object({
  dbBytes: z.number().int().nonnegative(),
  dbCapacityBytes: z.number().int().positive(),
  blobBytes: z.number().int().nonnegative(),
  blobCapacityBytes: z.number().int().positive(),
  capacityWarnPct: z.number().int().min(1).max(100),
  dbGrowthBytes: z.number().int().nullable(),
  blobGrowthBytes: z.number().int().nullable(),
  dbFullInDays: z.number().int().nonnegative().nullable(),
  blobFullInDays: z.number().int().nonnegative().nullable(),
  tables: z.array(tableSizeSchema),
  biggestUsers: z.array(storageRankSchema),
  biggestTrips: z.array(storageRankSchema),
})

export type AdminStorage = z.infer<typeof adminStorageSchema>

/** More than two calendar years, inclusive of leap days. */
export const metricsMaxSpanDays = 731

export function daySpan(from: string, to: string): number | null {
  if (!daySchema.safeParse(from).success || !daySchema.safeParse(to).success) {
    return null
  }
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (new Date(start).toISOString().slice(0, 10) !== from) return null
  if (new Date(end).toISOString().slice(0, 10) !== to) return null
  return Math.round((end - start) / 86_400_000)
}

/** R-29-07: a trip's kind limit as the admin trip detail shows it. */
export const adminKindLimitSchema = z.object({
  /** `COALESCE(override, default)`. */
  effective: z.number().int().min(1).max(64),
  /** `trips.max_kinds`; null means the platform default applies. */
  override: z.number().int().min(1).max(64).nullable(),
  default: z.number().int().min(1).max(64),
  /** The trip's current number of kinds (may exceed `effective`). */
  count: z.number().int().nonnegative(),
})
export type AdminKindLimit = z.infer<typeof adminKindLimitSchema>

/** `PATCH /admin/trips/:id/kind-limit`; null clears the override. */
export const kindLimitPatchSchema = z
  .object({
    maxKinds: z.number().int().min(1).max(64).nullable(),
    reason: reasonSchema.optional(),
  })
  .strict()
export type KindLimitPatch = z.infer<typeof kindLimitPatchSchema>

/** One row of `GET /admin/kind-limit-requests`. */
export const adminKindLimitRequestSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  tripName: z.string(),
  requestedBy: z.string().uuid().nullable(),
  requestedByName: z.string().nullable(),
  requestedMax: z.number().int().min(1).max(64),
  /** Effective limit now (after approval: the approved value). */
  currentLimit: z.number().int().min(1).max(64),
  kindCount: z.number().int().nonnegative(),
  message: z.string().nullable(),
  status: z.enum(['pending', 'approved', 'rejected']),
  decisionNote: z.string().nullable(),
  decidedBy: z.string().uuid().nullable(),
  decidedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})
export type AdminKindLimitRequest = z.infer<typeof adminKindLimitRequestSchema>

export const adminKindLimitRequestListSchema = z.object({
  requests: z.array(adminKindLimitRequestSchema),
  pendingCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
})
export type AdminKindLimitRequestList = z.infer<
  typeof adminKindLimitRequestListSchema
>

/** Approve sets `trips.max_kinds`; default = the requested value. */
export const kindLimitApproveSchema = z
  .object({
    maxKinds: z.number().int().min(1).max(64).optional(),
    note: reasonSchema.optional(),
  })
  .strict()
export type KindLimitApprove = z.infer<typeof kindLimitApproveSchema>

export const kindLimitRejectSchema = z
  .object({
    note: reasonSchema.optional(),
  })
  .strict()
