import { z } from 'zod'
import type { BBox } from './trips.js'

export const spotCategories = ['must_go', 'maybe', 'home'] as const
export const spotCategorySchema = z.enum(spotCategories)
export type SpotCategory = z.infer<typeof spotCategorySchema>

export const displayCategories = [
  'must_go',
  'maybe',
  'planned',
  'home',
] as const
export const displayCategorySchema = z.enum(displayCategories)
export type DisplayCategory = z.infer<typeof displayCategorySchema>

export const spotLimits = {
  title: 120,
  address: 300,
  info: 2000,
  link: 500,
} as const

const createdBySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  avatar: z.string().nullable(),
})

export const spotSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  title: z.string(),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  baseCategory: spotCategorySchema,
  displayCategory: displayCategorySchema,
  planCount: z.number().int().nonnegative(),
  firstScheduledAt: z.string().nullable(),
  stayFrom: z.string().nullable(),
  stayTo: z.string().nullable(),
  primary: z.boolean(),
  info: z.string().nullable(),
  link: z.string().nullable(),
  createdBy: createdBySchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Spot = z.infer<typeof spotSchema>

export const spotListSchema = z.object({
  spots: z.array(spotSchema),
  total: z.number().int().nonnegative(),
})

const httpLink = /^https?:\/\//i

function checkTitle(title: string, ctx: z.RefinementCtx) {
  const trimmed = title.trim()
  if (trimmed.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['title'],
      message: 'empty',
    })
  } else if (trimmed.length > spotLimits.title) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['title'],
      message: 'too_long',
    })
  }
}

function checkBaseCategory(value: string, ctx: z.RefinementCtx) {
  if (value === 'planned') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['baseCategory'],
      message: 'planned_automatic',
    })
    return
  }
  if (value !== 'must_go' && value !== 'maybe' && value !== 'home') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['baseCategory'],
      message: 'invalid',
    })
  }
}

function checkCoord(
  value: number,
  min: number,
  max: number,
  path: 'lat' | 'lng',
  ctx: z.RefinementCtx,
) {
  if (!Number.isFinite(value) || value < min || value > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: 'invalid',
    })
  }
}

function checkOptionalText(
  value: string | null | undefined,
  max: number,
  path: string,
  ctx: z.RefinementCtx,
) {
  if (value == null) return
  if (value.trim().length > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: 'too_long',
    })
  }
}

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

export function cleanStayDate(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

/** Field errors for stay dates and the primary-home flag. */
export function homeStayErrors(
  baseCategory: string,
  stayFrom: string | null | undefined,
  stayTo: string | null | undefined,
  primary: boolean | undefined,
): Record<string, string> {
  const from = cleanStayDate(stayFrom)
  const to = cleanStayDate(stayTo)
  const fields: Record<string, string> = {}
  if (baseCategory !== 'home') {
    if (from) fields.stayFrom = 'home_only'
    if (to) fields.stayTo = 'home_only'
    if (primary) fields.primary = 'home_only'
    return fields
  }
  if (from && !isRealDate(from)) fields.stayFrom = 'invalid_date'
  if (to && !isRealDate(to)) fields.stayTo = 'invalid_date'
  if (from && to && !fields.stayFrom && !fields.stayTo && to < from) {
    fields.stayTo = 'before_start'
  }
  return fields
}

/** True when two home stays share a day. A missing end date is that one day. */
export function staysOverlap(
  leftFrom: string | null,
  leftTo: string | null,
  rightFrom: string | null,
  rightTo: string | null,
): boolean {
  if (!leftFrom || !rightFrom) return false
  const leftEnd = leftTo ?? leftFrom
  const rightEnd = rightTo ?? rightFrom
  return leftFrom <= rightEnd && rightFrom <= leftEnd
}

/** Same overlap rule as `plan_entry_home`: stay covers the entry's date range. */
export function entryFallsInStay(
  startDate: string,
  endDate: string | null,
  stayFrom: string | null,
  stayTo: string | null,
): boolean {
  if (!stayFrom) return false
  const entryEnd = endDate ?? startDate
  const stayEnd = stayTo ?? stayFrom
  return stayFrom <= entryEnd && stayEnd >= startDate
}

function checkStay(
  data: {
    baseCategory?: string
    stayFrom?: string | null
    stayTo?: string | null
    primary?: boolean
  },
  ctx: z.RefinementCtx,
  categoryKnown: boolean,
): void {
  const errors =
    categoryKnown && data.baseCategory
      ? homeStayErrors(
          data.baseCategory,
          data.stayFrom,
          data.stayTo,
          data.primary,
        )
      : homeStayErrors('home', data.stayFrom, data.stayTo, false)
  for (const [path, message] of Object.entries(errors)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message,
    })
  }
}

function checkLink(value: string | null | undefined, ctx: z.RefinementCtx) {
  if (value == null) return
  const trimmed = value.trim()
  if (trimmed.length === 0) return
  if (trimmed.length > spotLimits.link) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['link'],
      message: 'too_long',
    })
    return
  }
  if (!httpLink.test(trimmed)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['link'],
      message: 'invalid',
    })
  }
}

export const createSpotSchema = z
  .object({
    title: z.string(),
    lat: z.number(),
    lng: z.number(),
    baseCategory: z.string(),
    address: z.string().nullable().optional(),
    info: z.string().nullable().optional(),
    link: z.string().nullable().optional(),
    stayFrom: z.string().nullable().optional(),
    stayTo: z.string().nullable().optional(),
    primary: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    checkTitle(data.title, ctx)
    checkCoord(data.lat, -90, 90, 'lat', ctx)
    checkCoord(data.lng, -180, 180, 'lng', ctx)
    checkBaseCategory(data.baseCategory, ctx)
    checkOptionalText(data.address, spotLimits.address, 'address', ctx)
    checkOptionalText(data.info, spotLimits.info, 'info', ctx)
    checkLink(data.link, ctx)
    if (
      data.baseCategory === 'must_go' ||
      data.baseCategory === 'maybe' ||
      data.baseCategory === 'home'
    ) {
      checkStay(data, ctx, true)
    }
  })

export type CreateSpotBody = z.infer<typeof createSpotSchema>

export const patchSpotSchema = z
  .object({
    title: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    baseCategory: z.string().optional(),
    address: z.string().nullable().optional(),
    info: z.string().nullable().optional(),
    link: z.string().nullable().optional(),
    stayFrom: z.string().nullable().optional(),
    stayTo: z.string().nullable().optional(),
    primary: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.title !== undefined) checkTitle(data.title, ctx)
    if (data.lat !== undefined) checkCoord(data.lat, -90, 90, 'lat', ctx)
    if (data.lng !== undefined) checkCoord(data.lng, -180, 180, 'lng', ctx)
    if (data.baseCategory !== undefined) {
      checkBaseCategory(data.baseCategory, ctx)
    }
    checkOptionalText(data.address, spotLimits.address, 'address', ctx)
    checkOptionalText(data.info, spotLimits.info, 'info', ctx)
    checkLink(data.link, ctx)
    if (
      data.baseCategory === 'must_go' ||
      data.baseCategory === 'maybe' ||
      data.baseCategory === 'home'
    ) {
      checkStay(data, ctx, true)
    } else if (data.stayFrom !== undefined || data.stayTo !== undefined) {
      checkStay(data, ctx, false)
    }
    if (
      data.title === undefined &&
      data.lat === undefined &&
      data.lng === undefined &&
      data.baseCategory === undefined &&
      data.address === undefined &&
      data.info === undefined &&
      data.link === undefined &&
      data.stayFrom === undefined &&
      data.stayTo === undefined &&
      data.primary === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: 'empty',
      })
    }
  })

export type PatchSpotBody = z.infer<typeof patchSpotSchema>

const padRatio = 0.1

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * When a point lies outside the trip box, grow the box to include it and
 * then pad every side by 10% of the new span. An inside point is unchanged.
 */
export function expandTripBBox(bbox: BBox, lng: number, lat: number): BBox {
  const inside =
    lng >= bbox.minLng &&
    lng <= bbox.maxLng &&
    lat >= bbox.minLat &&
    lat <= bbox.maxLat
  if (inside) return bbox

  const minLng = Math.min(bbox.minLng, lng)
  const minLat = Math.min(bbox.minLat, lat)
  const maxLng = Math.max(bbox.maxLng, lng)
  const maxLat = Math.max(bbox.maxLat, lat)
  const padLng = (maxLng - minLng) * padRatio
  const padLat = (maxLat - minLat) * padRatio
  const nextMinLng = clamp(minLng - padLng, -180, 180)
  const nextMaxLng = clamp(maxLng + padLng, -180, 180)
  const nextMinLat = clamp(minLat - padLat, -90, 90)
  const nextMaxLat = clamp(maxLat + padLat, -90, 90)
  return {
    minLng: Math.min(nextMinLng, nextMaxLng),
    maxLng: Math.max(nextMinLng, nextMaxLng),
    minLat: Math.min(nextMinLat, nextMaxLat),
    maxLat: Math.max(nextMinLat, nextMaxLat),
  }
}
