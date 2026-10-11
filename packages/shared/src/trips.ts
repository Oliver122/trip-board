import { z } from 'zod'

/** Lowest to highest. `admin` is a board admin (step 28). */
export const tripRoles = ['visitor', 'planner', 'admin', 'owner'] as const
export const tripRoleSchema = z.enum(tripRoles)
export type TripRole = z.infer<typeof tripRoleSchema>

export const bboxSchema = z.object({
  minLng: z.number().gte(-180).lte(180),
  minLat: z.number().gte(-90).lte(90),
  maxLng: z.number().gte(-180).lte(180),
  maxLat: z.number().gte(-90).lte(90),
})

export type BBox = z.infer<typeof bboxSchema>

const timeZones = new Set(Intl.supportedValuesOf('timeZone'))

const tripMemberSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
})

export const tripSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: tripRoleSchema,
  memberCount: z.number().int().nonnegative(),
  createdByName: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  timezone: z.string(),
  updatedAt: z.string().optional(),
  region: z.object({ bbox: bboxSchema }),
  members: z.array(tripMemberSchema),
  unreadComments: z.number().int().nonnegative(),
})

export type Trip = z.infer<typeof tripSchema>

export const tripListSchema = z.object({
  trips: z.array(tripSchema),
})

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function checkName(name: string, ctx: z.RefinementCtx) {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['name'],
      message: 'empty',
    })
  } else if (trimmed.length > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['name'],
      message: 'too_long',
    })
  }
}

function checkDate(
  value: string | null | undefined,
  path: string,
  ctx: z.RefinementCtx,
) {
  if (value == null) return
  if (!isRealDate(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: 'invalid_date',
    })
  }
}

function checkDateOrder(
  start: string | null | undefined,
  end: string | null | undefined,
  ctx: z.RefinementCtx,
) {
  if (start && end && isRealDate(start) && isRealDate(end) && end < start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'before_start',
    })
  }
}

function checkBBox(bbox: BBox | undefined, ctx: z.RefinementCtx) {
  if (!bbox) return
  if (bbox.minLng > bbox.maxLng || bbox.minLat > bbox.maxLat) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['region', 'bbox'],
      message: 'min_greater_than_max',
    })
  }
}

function checkTimezone(timezone: string, ctx: z.RefinementCtx) {
  if (!timeZones.has(timezone)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['timezone'],
      message: 'invalid',
    })
  }
}

export const createTripSchema = z
  .object({
    name: z.string(),
    region: z.object({ bbox: bboxSchema }),
    timezone: z.string(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    checkName(data.name, ctx)
    checkTimezone(data.timezone, ctx)
    checkDate(data.startDate, 'startDate', ctx)
    checkDate(data.endDate, 'endDate', ctx)
    checkDateOrder(data.startDate, data.endDate, ctx)
    checkBBox(data.region.bbox, ctx)
  })

export type CreateTripBody = z.infer<typeof createTripSchema>

export const patchTripSchema = z
  .object({
    name: z.string().optional(),
    region: z.object({ bbox: bboxSchema }).optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.name !== undefined) checkName(data.name, ctx)
    checkDate(data.startDate, 'startDate', ctx)
    checkDate(data.endDate, 'endDate', ctx)
    checkDateOrder(data.startDate, data.endDate, ctx)
    checkBBox(data.region?.bbox, ctx)
    if (
      data.name === undefined &&
      data.region === undefined &&
      data.startDate === undefined &&
      data.endDate === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: 'empty',
      })
    }
  })

export type PatchTripBody = z.infer<typeof patchTripSchema>
