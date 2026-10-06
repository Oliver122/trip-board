import { z } from 'zod'

/** Proof that both apps share one schema. Step 00 only. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.enum(['ok', 'down']),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>

export const healthResponseSample: HealthResponse = {
  status: 'ok',
  db: 'ok',
}

export const meResponseSchema = z.object({
  id: z.string().uuid(),
  discordId: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  locale: z.enum(['en', 'de']),
  appRole: z.enum(['user', 'admin']),
})

export type MeResponse = z.infer<typeof meResponseSchema>

/** Same-origin relative path, or `/trips` when the value could leave the app. */
export function safeNextPath(input: string | null | undefined): string {
  if (input == null || input === '') return '/trips'
  let value = input
  try {
    value = decodeURIComponent(input)
  } catch {
    return '/trips'
  }
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('://') ||
    value.includes('\0') ||
    /[\r\n]/.test(value)
  ) {
    return '/trips'
  }
  return value
}

const inviteCodePattern = /^\/join\/([A-Z0-9]{3}-[A-Z0-9]{4})$/

export function inviteCodeFromPath(path: string): string | null {
  return inviteCodePattern.exec(path)?.[1] ?? null
}

/** Vite's default is 5173; Fastify samples often use 3000. These are neither. */
export const defaultWebPort = 5180
export const defaultApiPort = 4080

export { knownRegions, searchRegions } from './regions.js'
export type { KnownRegion } from './regions.js'
export {
  geocodeLangSchema,
  geocodeLangs,
  geocodePlaceSchema,
  geocodeQueryLimit,
  geocodeSearchSchema,
  nominatimViewbox,
  reverseCacheKey,
  searchCacheKey,
} from './geocode.js'
export type { GeocodeLang, GeocodePlace, GeocodeSearch } from './geocode.js'
export {
  cleanStayDate,
  createSpotSchema,
  displayCategories,
  displayCategorySchema,
  entryFallsInStay,
  expandTripBBox,
  homeStayErrors,
  patchSpotSchema,
  spotCategories,
  spotCategorySchema,
  spotLimits,
  spotListSchema,
  spotSchema,
  staysOverlap,
} from './spots.js'
export type {
  CreateSpotBody,
  DisplayCategory,
  PatchSpotBody,
  Spot,
  SpotCategory,
} from './spots.js'
export {
  addPlanSpotSchema,
  createPlanEntrySchema,
  normalizePlanDraft,
  outsideVisitMessage,
  patchPlanEntrySchema,
  patchPlanSpotSchema,
  planEntryErrors,
  planEntrySchema,
  planEntryTypeSchema,
  planEntryTypes,
  planEntryUpdateSchema,
  planLimits,
  planLinkSchema,
  planListSchema,
  reorderPlanSpotsSchema,
  spotDetailSchema,
  spotPlanSchema,
} from './plans.js'
export type {
  AddPlanSpot,
  CreatePlanEntry,
  PatchPlanEntry,
  PatchPlanSpot,
  PlanDraft,
  PlanEntry,
  PlanEntryType,
  PlanEntryUpdate,
  PlanLink,
  ReorderPlanSpots,
  SpotDetail,
  SpotPlan,
} from './plans.js'
export {
  defaultSpotListQuery,
  parseSpotListQuery,
  spotFiltersActive,
  spotListSearchParams,
  spotListStatuses,
  spotListStatusSchema,
  spotSearchPattern,
  spotSortSchema,
  spotSorts,
  strictSpotListQuery,
} from './spot-query.js'
export type {
  SpotListFilters,
  SpotListQuery,
  SpotListStatus,
  SpotSort,
} from './spot-query.js'
export {
  imageListSchema,
  imageSchema,
  maxUploadBytes,
  quotaSchema,
} from './images.js'
export type { ImageList, Quota, SpotImage } from './images.js'
export {
  bboxSchema,
  createTripSchema,
  patchTripSchema,
  tripListSchema,
  tripRoleSchema,
  tripRoles,
  tripSchema,
} from './trips.js'
export type {
  BBox,
  CreateTripBody,
  PatchTripBody,
  Trip,
  TripRole,
} from './trips.js'
