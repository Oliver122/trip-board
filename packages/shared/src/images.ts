import { z } from 'zod'

/**
 * Step 43 (R-43-02): the largest image file per user. `default` applies
 * unless the platform default or a per-user override says otherwise; every
 * value stays between `min` and `max`. "MB" in texts means MiB.
 */
export const fileSizeLimits = {
  min: 1024 * 1024,
  max: 50 * 1024 * 1024,
  default: 10 * 1024 * 1024,
} as const

/** A per-file limit in bytes: whole bytes from 1 MiB to 50 MiB (R-43-05). */
export const maxFileBytesSchema = z
  .number()
  .int()
  .min(fileSizeLimits.min)
  .max(fileSizeLimits.max)

export const imageSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  spotId: z.string().uuid(),
  url: z.string().min(1),
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  /** Step 34 (R-34-05): null for uploaded files. */
  sourceUrl: z.string().max(2000).nullable().default(null),
  credit: z.string().max(300).nullable().default(null),
  license: z.string().max(100).nullable().default(null),
})

export type SpotImage = z.infer<typeof imageSchema>

export const imageListSchema = z.object({
  images: z.array(imageSchema),
  uploadsEnabled: z.boolean(),
})

export type ImageList = z.infer<typeof imageListSchema>

export const quotaSchema = z.object({
  usedImages: z.number().int().nonnegative(),
  maxImages: z.number().int().nonnegative(),
  usedBytes: z.number().int().nonnegative(),
  maxBytes: z.number().int().nonnegative(),
  /** Step 43 (R-43-04): the effective per-file limit. */
  maxFileBytes: z.number().int().positive(),
})

export type Quota = z.infer<typeof quotaSchema>

/** Step 34: photos from the web and Wikimedia Commons. */
export const webImageLimits = {
  url: 2000,
  sourceUrl: 2000,
  credit: 300,
  license: 100,
  suggestions: 8,
  queued: 4,
} as const

export const webImageErrorCodes = [
  'url_not_allowed',
  'fetch_failed',
  'commons_failed',
  'license_not_allowed',
  'already_added',
] as const

export type WebImageErrorCode = (typeof webImageErrorCodes)[number]

export const imageFromUrlSchema = z.object({
  url: z.string(),
})

export type ImageFromUrlBody = z.infer<typeof imageFromUrlSchema>

export const imageFromCommonsSchema = z.object({
  fileTitle: z.string().min(1).max(255),
})

export type ImageFromCommonsBody = z.infer<typeof imageFromCommonsSchema>

export const photoSuggestionSchema = z.object({
  /** e.g. "File:Kinkaku-ji 2019.jpg" */
  fileTitle: z.string().min(1),
  thumbUrl: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Plain text, no HTML. */
  artist: z.string(),
  /** Short name, e.g. "CC BY-SA 4.0". */
  license: z.string(),
  /** The file's description page; stored as the image's sourceUrl when added. */
  descriptionUrl: z.string().url(),
})

export type PhotoSuggestion = z.infer<typeof photoSuggestionSchema>

export const photoSuggestionListSchema = z.object({
  suggestions: z.array(photoSuggestionSchema).max(webImageLimits.suggestions),
})

export type PhotoSuggestionList = z.infer<typeof photoSuggestionListSchema>
