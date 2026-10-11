import { z } from 'zod'
import { kindLimits, spotKindRefSchema } from './kinds.js'
import type { BBox } from './trips.js'

/** Stored base of a spot: it has kinds, or it is a home spot (step 28). */
export const spotCategories = ['kind', 'home'] as const
export const spotCategorySchema = z.enum(spotCategories)
export type SpotCategory = z.infer<typeof spotCategorySchema>

/**
 * Values a write may send as `category` (or the legacy `baseCategory`):
 * `home`, or a preset name that maps to the trip's kind with that preset.
 */
export const spotCategoryInputs = ['home', 'must_go', 'maybe'] as const
export type SpotCategoryInput = (typeof spotCategoryInputs)[number]

/** Priority home > planned > kind. */
export const displayCategories = ['kind', 'planned', 'home'] as const
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
  /** The spot's kinds in trip kind order; the first is the primary kind. Empty for home. */
  kinds: z.array(spotKindRefSchema),
  planCount: z.number().int().nonnegative(),
  firstScheduledAt: z.string().nullable(),
  stayFrom: z.string().nullable(),
  stayTo: z.string().nullable(),
  primary: z.boolean(),
  info: z.string().nullable(),
  link: z.string().nullable(),
  createdBy: createdBySchema.nullable(),
  commentCount: z.number().int().nonnegative(),
  unreadComments: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Spot = z.infer<typeof spotSchema>

export const spotListSchema = z.object({
  spots: z.array(spotSchema),
  total: z.number().int().nonnegative(),
})

const httpLink = /^https?:\/\//i
const otherScheme = /^[a-z][a-z0-9+.-]*:/i

/**
 * Accepts a web address with or without a scheme.
 * `www.hotel.jp` becomes `https://www.hotel.jp`. `HTTP://x.de` is kept as typed.
 * Anything that is still not an http(s) URL is `invalid` (including whitespace
 * only, `javascript:`, and `ftp:`).
 */
export function normalizeSpotLink(
  value: string | null | undefined,
): { link: string | null } | { error: 'invalid' | 'too_long' } {
  if (value == null) return { link: null }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return value.length > 0 ? { error: 'invalid' } : { link: null }
  }
  if (trimmed.length > spotLimits.link) return { error: 'too_long' }
  if (httpLink.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { error: 'invalid' }
      }
      if (url.hostname.length === 0) return { error: 'invalid' }
    } catch {
      return { error: 'invalid' }
    }
    return { link: trimmed }
  }
  if (otherScheme.test(trimmed) || /\s/.test(trimmed)) {
    return { error: 'invalid' }
  }
  const withScheme = `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (!url.hostname.includes('.')) return { error: 'invalid' }
  } catch {
    return { error: 'invalid' }
  }
  return { link: withScheme }
}

function withNormalizedLink<T extends { link?: string | null }>(data: T): T {
  if (data.link === undefined) return data
  const normalized = normalizeSpotLink(data.link)
  if ('error' in normalized) return data
  return { ...data, link: normalized.link }
}

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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CategoryFields = {
  kindIds?: string[]
  category?: string
  baseCategory?: string
}

/** `category`, falling back to the legacy `baseCategory` field. */
export function requestedCategory(data: CategoryFields): string | undefined {
  return data.category ?? data.baseCategory
}

/** True when the write makes the spot a home spot. */
export function requestsHome(data: CategoryFields): boolean {
  return data.kindIds === undefined && requestedCategory(data) === 'home'
}

function categoryIssue(ctx: z.RefinementCtx, path: string, message: string) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
}

/**
 * `kindIds` (1 or 2 different ids) or `category`, never both. Messages:
 * `conflict`, `count`, `invalid`, `duplicate`, `required`, `planned_automatic`.
 */
function checkCategory(
  data: CategoryFields,
  ctx: z.RefinementCtx,
  required: boolean,
) {
  const category = requestedCategory(data)
  if (data.kindIds !== undefined) {
    const ids = data.kindIds
    if (category !== undefined) {
      categoryIssue(ctx, 'kindIds', 'conflict')
    } else if (ids.length < 1 || ids.length > kindLimits.perSpot) {
      categoryIssue(ctx, 'kindIds', 'count')
    } else if (ids.some((id) => !uuidPattern.test(id))) {
      categoryIssue(ctx, 'kindIds', 'invalid')
    } else if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) {
      categoryIssue(ctx, 'kindIds', 'duplicate')
    }
    return
  }
  if (category === undefined) {
    if (required) categoryIssue(ctx, 'kindIds', 'required')
    return
  }
  if (category === 'planned') {
    categoryIssue(ctx, 'category', 'planned_automatic')
  } else if (!(spotCategoryInputs as readonly string[]).includes(category)) {
    categoryIssue(ctx, 'category', 'invalid')
  }
}

/** Folds the legacy `baseCategory` into `category`. */
function withCategory<T extends CategoryFields>(
  data: T,
): Omit<T, 'baseCategory' | 'category'> & { category?: SpotCategoryInput } {
  const rest = { ...data } as CategoryFields
  delete rest.baseCategory
  delete rest.category
  const category = requestedCategory(data) as SpotCategoryInput | undefined
  const folded = category === undefined ? rest : { ...rest, category }
  return folded as Omit<T, 'baseCategory' | 'category'> & {
    category?: SpotCategoryInput
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
  const normalized = normalizeSpotLink(value)
  if (!('error' in normalized)) return
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['link'],
    message: normalized.error,
  })
}

export const createSpotSchema = z
  .object({
    title: z.string(),
    lat: z.number(),
    lng: z.number(),
    kindIds: z.array(z.string()).optional(),
    category: z.string().optional(),
    /** Legacy name of `category`. */
    baseCategory: z.string().optional(),
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
    checkCategory(data, ctx, true)
    checkOptionalText(data.address, spotLimits.address, 'address', ctx)
    checkOptionalText(data.info, spotLimits.info, 'info', ctx)
    checkLink(data.link, ctx)
    checkStay(
      { ...data, baseCategory: requestsHome(data) ? 'home' : 'kind' },
      ctx,
      true,
    )
  })
  .transform((data) => withCategory(withNormalizedLink(data)))

export type CreateSpotBody = z.infer<typeof createSpotSchema>

export const patchSpotSchema = z
  .object({
    title: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    kindIds: z.array(z.string()).optional(),
    category: z.string().optional(),
    /** Legacy name of `category`. */
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
    checkCategory(data, ctx, false)
    checkOptionalText(data.address, spotLimits.address, 'address', ctx)
    checkOptionalText(data.info, spotLimits.info, 'info', ctx)
    checkLink(data.link, ctx)
    if (data.kindIds !== undefined || requestedCategory(data) !== undefined) {
      checkStay(
        { ...data, baseCategory: requestsHome(data) ? 'home' : 'kind' },
        ctx,
        true,
      )
    } else if (data.stayFrom !== undefined || data.stayTo !== undefined) {
      checkStay(data, ctx, false)
    }
    if (
      data.title === undefined &&
      data.lat === undefined &&
      data.lng === undefined &&
      data.kindIds === undefined &&
      requestedCategory(data) === undefined &&
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
  .transform((data) => withCategory(withNormalizedLink(data)))

export type PatchSpotBody = z.infer<typeof patchSpotSchema>

export const spotImportSources = [
  'google_csv',
  'google_geojson',
  'kml',
] as const
export const spotImportSourceSchema = z.enum(spotImportSources)
export type SpotImportSource = z.infer<typeof spotImportSourceSchema>

/** Import target when no `kindIds` are sent: a preset kind, or home. */
export const spotImportBaseCategories = ['must_go', 'maybe', 'home'] as const
export const spotImportBaseCategorySchema = z.enum(spotImportBaseCategories)
export type SpotImportBaseCategory = z.infer<
  typeof spotImportBaseCategorySchema
>

export const spotImportLimit = 500

const spotImportRowSchema = z
  .object({
    title: z.string(),
    lat: z.number(),
    lng: z.number(),
    address: z.string().nullable().optional(),
    info: z.string().nullable().optional(),
    link: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    checkTitle(data.title, ctx)
    checkCoord(data.lat, -90, 90, 'lat', ctx)
    checkCoord(data.lng, -180, 180, 'lng', ctx)
    checkOptionalText(data.address, spotLimits.address, 'address', ctx)
    checkOptionalText(data.info, spotLimits.info, 'info', ctx)
    checkLink(data.link, ctx)
  })
  .transform(withNormalizedLink)

export type SpotImportRow = z.infer<typeof spotImportRowSchema>

/** Every imported spot gets the same `kindIds`, or the same `category`. */
export const spotImportSchema = z
  .object({
    source: spotImportSourceSchema,
    kindIds: z.array(z.string()).optional(),
    category: z.string().optional(),
    /** Legacy name of `category`. */
    baseCategory: z.string().optional(),
    spots: z.array(spotImportRowSchema).min(1).max(spotImportLimit),
  })
  .superRefine((data, ctx) => checkCategory(data, ctx, true))
  .transform((data) => withCategory(data))

export type SpotImportBody = z.infer<typeof spotImportSchema>

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

/**
 * Same rule as {@link expandTripBBox}, generalized to many points so an
 * import expands the trip box once, padded by 10% of the combined span,
 * instead of compounding the padding once per inserted spot.
 */
export function expandTripBBoxForPoints(
  bbox: BBox,
  points: readonly { lng: number; lat: number }[],
): BBox {
  let minLng = bbox.minLng
  let minLat = bbox.minLat
  let maxLng = bbox.maxLng
  let maxLat = bbox.maxLat
  let changed = false
  for (const point of points) {
    if (point.lng < minLng) {
      minLng = point.lng
      changed = true
    }
    if (point.lng > maxLng) {
      maxLng = point.lng
      changed = true
    }
    if (point.lat < minLat) {
      minLat = point.lat
      changed = true
    }
    if (point.lat > maxLat) {
      maxLat = point.lat
      changed = true
    }
  }
  if (!changed) return bbox
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
