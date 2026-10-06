import { z } from 'zod'

export const maxUploadBytes = 10 * 1024 * 1024

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
})

export type Quota = z.infer<typeof quotaSchema>
