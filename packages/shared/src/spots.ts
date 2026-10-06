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
  })
  .superRefine((data, ctx) => {
    checkTitle(data.title, ctx)
    checkCoord(data.lat, -90, 90, 'lat', ctx)
    checkCoord(data.lng, -180, 180, 'lng', ctx)
    checkBaseCategory(data.baseCategory, ctx)
    checkOptionalText(data.address, spotLimits.address, 'address', ctx)
    checkOptionalText(data.info, spotLimits.info, 'info', ctx)
    checkLink(data.link, ctx)
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
      data.title === undefined &&
      data.lat === undefined &&
      data.lng === undefined &&
      data.baseCategory === undefined &&
      data.address === undefined &&
      data.info === undefined &&
      data.link === undefined
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
