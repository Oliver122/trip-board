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
  /** Step 47 (R-47-01): null for a photobook photo without a spot. */
  spotId: z.string().uuid().nullable(),
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
  /** Step 47 (R-47-01): the photo's own point, capture time and caption. */
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  takenAt: z.string().nullable().default(null),
  placeSource: z.enum(['exif', 'manual']).nullable().default(null),
  caption: z.string().max(500).nullable().default(null),
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

/** Step 47: the photobook. */
export const photoLimits = {
  caption: 500,
  /** A photo is linked to the nearest spot within this distance (R-47-02). */
  linkRadiusMeters: 150,
  /** Files per drop or pick (R-47-08). */
  batch: 50,
} as const

/** `YYYY-MM-DDTHH:MM:SS`, the camera's wall-clock time, no zone (R-47-02). */
export const takenAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}Z`)
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 19) === value
    )
  }, 'invalid')

export const placeSourceSchema = z.enum(['exif', 'manual'])

export type PlaceSource = z.infer<typeof placeSourceSchema>

/** One photo of the trip as the photobook shows it (R-47-03). */
export const photoSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  /** Signed, like every image URL (C-IMG-08). */
  url: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  /** The photo's own point, else its spot's point, else null. */
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  /** `YYYY-MM-DDTHH:MM:SS` or null. */
  takenAt: z.string().nullable(),
  spotId: z.string().uuid().nullable(),
  spotTitle: z.string().nullable(),
  /** `exif` / `manual` when the photo has its own point; null otherwise. */
  placeSource: placeSourceSchema.nullable(),
  caption: z.string().max(500).nullable(),
  /** Null when the uploader's account is gone. */
  uploadedBy: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  createdAt: z.string().datetime(),
})

export type Photo = z.infer<typeof photoSchema>

export const photoListSchema = z.object({
  photos: z.array(photoSchema),
  uploadsEnabled: z.boolean(),
})

export type PhotoList = z.infer<typeof photoListSchema>

/**
 * Multipart text fields of `POST /trips/:id/photos` (R-47-02); the client
 * appends them before the file. Empty strings count as absent.
 */
export const photoUploadFieldsSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    takenAt: takenAtSchema.optional(),
    spotId: z.string().uuid().optional(),
    caption: z.string().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.lat === undefined) !== (value.lng === undefined)) {
      const path = value.lat === undefined ? 'lat' : 'lng'
      ctx.addIssue({ code: 'custom', path: [path], message: 'both_or_none' })
    }
  })

export type PhotoUploadFields = z.infer<typeof photoUploadFieldsSchema>

/** `PATCH /images/:id` (R-47-04). `caption: null` or `''` clears it. */
export const patchImageSchema = z
  .object({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    spotId: z.string().uuid().nullable().optional(),
    caption: z.string().max(500).nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.lat === undefined) !== (value.lng === undefined)) {
      const path = value.lat === undefined ? 'lat' : 'lng'
      ctx.addIssue({ code: 'custom', path: [path], message: 'both_or_none' })
    }
  })

export type PatchImageBody = z.infer<typeof patchImageSchema>
