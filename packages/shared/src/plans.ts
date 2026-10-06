import { z } from 'zod'
import { spotSchema } from './spots.js'

export const planEntryTypes = ['bucket', 'single'] as const
export const planEntryTypeSchema = z.enum(planEntryTypes)
export type PlanEntryType = z.infer<typeof planEntryTypeSchema>

export const planLimits = {
  title: 120,
  info: 2000,
} as const

export const outsideVisitMessage =
  'Visit date must be inside the plan entry range'

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export type PlanDraft = {
  type: PlanEntryType
  title: string
  startDate: string
  endDate: string | null
  startTime: string | null
  endTime: string | null
  info: string | null
}

export const planLinkSchema = z.object({
  id: z.string().uuid(),
  spotId: z.string().uuid(),
  title: z.string(),
  visitDate: z.string().nullable(),
  visitTime: z.string().nullable(),
  info: z.string().nullable(),
  sortOrder: z.number().int(),
})

export type PlanLink = z.infer<typeof planLinkSchema>

export const planEntrySchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  type: planEntryTypeSchema,
  title: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  info: z.string().nullable(),
  sortOrder: z.number().int(),
  outsideTripDates: z.boolean(),
  spots: z.array(planLinkSchema),
  home: z
    .object({
      spotId: z.string().uuid(),
      title: z.string(),
    })
    .nullable(),
})

export type PlanEntry = z.infer<typeof planEntrySchema>

export const planListSchema = z.object({
  entries: z.array(planEntrySchema),
})

export const planEntryUpdateSchema = planEntrySchema.extend({
  clearedVisitDates: z.number().int().nonnegative(),
})

export type PlanEntryUpdate = z.infer<typeof planEntryUpdateSchema>

export const spotPlanSchema = z.object({
  linkId: z.string().uuid(),
  entryId: z.string().uuid(),
  title: z.string(),
  type: planEntryTypeSchema,
  visitDate: z.string().nullable(),
  visitTime: z.string().nullable(),
})

export type SpotPlan = z.infer<typeof spotPlanSchema>

export const spotDetailSchema = spotSchema.extend({
  plans: z.array(spotPlanSchema),
})

export type SpotDetail = z.infer<typeof spotDetailSchema>

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

function cleanTime(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function cleanInfo(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function normalizePlanDraft(draft: PlanDraft): PlanDraft {
  let endDate = draft.endDate
  if (draft.type === 'single' && endDate === draft.startDate) endDate = null
  return {
    type: draft.type,
    title: draft.title.trim(),
    startDate: draft.startDate,
    endDate,
    startTime: cleanTime(draft.startTime),
    endTime: cleanTime(draft.endTime),
    info: cleanInfo(draft.info),
  }
}

/** Field errors for a bucket or single entry. Empty object means the draft is valid. */
export function planEntryErrors(draft: PlanDraft): Record<string, string> {
  const fields: Record<string, string> = {}
  if (draft.title.length === 0) fields.title = 'empty'
  else if (draft.title.length > planLimits.title) fields.title = 'too_long'
  if (draft.info && draft.info.length > planLimits.info)
    fields.info = 'too_long'
  if (!isRealDate(draft.startDate)) fields.startDate = 'invalid_date'
  if (draft.startTime && !timePattern.test(draft.startTime)) {
    fields.startTime = 'invalid_time'
  }
  if (draft.endTime && !timePattern.test(draft.endTime)) {
    fields.endTime = 'invalid_time'
  }
  if (draft.endTime && !draft.startTime && !fields.endTime) {
    fields.endTime = 'end_time_needs_start'
  }
  if (draft.type === 'bucket') {
    if (!draft.endDate) fields.endDate = 'end_date_required'
    else if (!isRealDate(draft.endDate)) fields.endDate = 'invalid_date'
    else if (
      isRealDate(draft.startDate) &&
      draft.endDate < draft.startDate &&
      !fields.endDate
    ) {
      fields.endDate = 'before_start'
    }
  } else if (draft.endDate && draft.endDate !== draft.startDate) {
    fields.endDate = 'spans_days'
  } else if (
    draft.startTime &&
    draft.endTime &&
    draft.endTime <= draft.startTime &&
    !fields.endTime
  ) {
    fields.endTime = 'end_before_start'
  }
  return fields
}

const createShape = z.object({
  type: z.string(),
  title: z.string(),
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  info: z.string().nullable().optional(),
})

type CreateInput = z.infer<typeof createShape>

function draftFromCreate(data: CreateInput): PlanDraft {
  const type = data.type === 'single' ? 'single' : 'bucket'
  const startDate =
    type === 'single'
      ? (data.date ?? data.startDate ?? '')
      : (data.startDate ?? '')
  let endDate =
    data.endDate == null || data.endDate === '' ? null : data.endDate
  if (type === 'single' && endDate === startDate) endDate = null
  return normalizePlanDraft({
    type,
    title: data.title,
    startDate,
    endDate,
    startTime: data.startTime ?? null,
    endTime: data.endTime ?? null,
    info: data.info ?? null,
  })
}

function issue(ctx: z.RefinementCtx, path: string, message: string): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [path],
    message,
  })
}

export const createPlanEntrySchema = createShape
  .superRefine((data, ctx) => {
    if (data.type !== 'bucket' && data.type !== 'single') {
      issue(ctx, 'type', 'invalid')
      return
    }
    if (
      data.type === 'single' &&
      data.date !== undefined &&
      data.startDate !== undefined &&
      data.date !== data.startDate
    ) {
      issue(ctx, 'startDate', 'invalid')
      return
    }
    const errors = planEntryErrors(draftFromCreate(data))
    for (const [key, message] of Object.entries(errors)) {
      const path =
        key === 'startDate' &&
        data.type === 'single' &&
        data.startDate === undefined
          ? 'date'
          : key
      issue(ctx, path, message)
    }
  })
  .transform((data) => draftFromCreate(data))

export type CreatePlanEntry = z.infer<typeof createPlanEntrySchema>

function checkOptionalDate(
  value: string | null | undefined,
  path: string,
  ctx: z.RefinementCtx,
  allowNull: boolean,
): void {
  if (value === undefined) return
  if (value === null) {
    if (!allowNull) issue(ctx, path, 'invalid_date')
    return
  }
  if (!isRealDate(value)) issue(ctx, path, 'invalid_date')
}

function checkOptionalTime(
  value: string | null | undefined,
  path: string,
  ctx: z.RefinementCtx,
): void {
  if (value == null) return
  if (!timePattern.test(value.trim())) issue(ctx, path, 'invalid_time')
}

export const patchPlanEntrySchema = z
  .object({
    title: z.string().optional(),
    date: z.string().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    startTime: z.string().nullable().optional(),
    endTime: z.string().nullable().optional(),
    info: z.string().nullable().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.title === undefined &&
      data.date === undefined &&
      data.startDate === undefined &&
      data.endDate === undefined &&
      data.startTime === undefined &&
      data.endTime === undefined &&
      data.info === undefined &&
      data.sortOrder === undefined
    ) {
      issue(ctx, 'body', 'empty')
    }
    if (data.title !== undefined) {
      const title = data.title.trim()
      if (title.length === 0) issue(ctx, 'title', 'empty')
      else if (title.length > planLimits.title) issue(ctx, 'title', 'too_long')
    }
    checkOptionalDate(data.date, 'date', ctx, false)
    checkOptionalDate(data.startDate, 'startDate', ctx, false)
    checkOptionalDate(data.endDate, 'endDate', ctx, true)
    checkOptionalTime(data.startTime, 'startTime', ctx)
    checkOptionalTime(data.endTime, 'endTime', ctx)
    if (data.info && data.info.trim().length > planLimits.info) {
      issue(ctx, 'info', 'too_long')
    }
    if (
      data.date !== undefined &&
      data.startDate != null &&
      data.date !== data.startDate
    ) {
      issue(ctx, 'startDate', 'invalid')
    }
  })

export type PatchPlanEntry = z.infer<typeof patchPlanEntrySchema>

export const addPlanSpotSchema = z
  .object({
    spotId: z.string().uuid({ message: 'invalid' }),
    visitDate: z.string().nullable().optional(),
    visitTime: z.string().nullable().optional(),
    info: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.visitDate != null &&
      data.visitDate !== '' &&
      !isRealDate(data.visitDate)
    ) {
      issue(ctx, 'visitDate', 'invalid_date')
    }
    checkOptionalTime(data.visitTime, 'visitTime', ctx)
    const date =
      data.visitDate != null && data.visitDate !== '' ? data.visitDate : null
    if (cleanTime(data.visitTime) && !date) {
      issue(ctx, 'visitTime', 'visit_time_needs_date')
    }
    if (data.info && data.info.trim().length > planLimits.info) {
      issue(ctx, 'info', 'too_long')
    }
  })
  .transform((data) => ({
    spotId: data.spotId,
    visitDate:
      data.visitDate != null && isRealDate(data.visitDate)
        ? data.visitDate
        : null,
    visitTime: cleanTime(data.visitTime),
    info: cleanInfo(data.info),
  }))

export type AddPlanSpot = z.infer<typeof addPlanSpotSchema>

export const patchPlanSpotSchema = z
  .object({
    visitDate: z.string().nullable().optional(),
    visitTime: z.string().nullable().optional(),
    info: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.visitDate === undefined &&
      data.visitTime === undefined &&
      data.info === undefined
    ) {
      issue(ctx, 'body', 'empty')
    }
    if (
      data.visitDate != null &&
      data.visitDate !== '' &&
      !isRealDate(data.visitDate)
    ) {
      issue(ctx, 'visitDate', 'invalid_date')
    }
    checkOptionalTime(data.visitTime, 'visitTime', ctx)
    if (data.visitDate === null && cleanTime(data.visitTime)) {
      issue(ctx, 'visitTime', 'visit_time_needs_date')
    }
    if (data.info && data.info.trim().length > planLimits.info) {
      issue(ctx, 'info', 'too_long')
    }
  })
  .transform((data) => ({
    visitDate:
      data.visitDate === undefined
        ? undefined
        : data.visitDate != null && isRealDate(data.visitDate)
          ? data.visitDate
          : null,
    visitTime:
      data.visitTime === undefined ? undefined : cleanTime(data.visitTime),
    info: data.info === undefined ? undefined : cleanInfo(data.info),
  }))

export type PatchPlanSpot = z.infer<typeof patchPlanSpotSchema>

export const reorderPlanSpotsSchema = z.object({
  linkIds: z.array(z.string().uuid({ message: 'invalid' })),
})

export type ReorderPlanSpots = z.infer<typeof reorderPlanSpotsSchema>
