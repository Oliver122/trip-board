import { z } from 'zod'

/** Step 33: a place handed over as a Google Maps link (R-33-02, R-33-04). */
export const placeLinkLimits = {
  url: 2000,
  text: 2000,
  title: 120,
  link: 500,
} as const

export const placeLinkErrorCodes = [
  'link_not_google_maps',
  'link_resolve_failed',
] as const

export type PlaceLinkErrorCode = (typeof placeLinkErrorCodes)[number]

export const placeFromLinkBodySchema = z.object({
  url: z.string().max(placeLinkLimits.url).optional(),
  text: z.string().max(placeLinkLimits.text).optional(),
})

export type PlaceFromLinkBody = z.infer<typeof placeFromLinkBodySchema>

export const placeFromLinkSchema = z.object({
  title: z.string().max(placeLinkLimits.title).nullable(),
  address: z.string().nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  link: z.string().min(1),
  placed: z.boolean(),
})

export type PlaceFromLink = z.infer<typeof placeFromLinkSchema>
