import {
  placeFromLinkSchema,
  placeLinkErrorCodes,
  placeLinkLimits,
  type PlaceFromLink,
} from '@tripboard/shared'
import type { TFunction } from 'i18next'
import { ApiError, requestJson } from '../api/http'

const urlPattern = /https?:\/\/\S+/i

/** Resolves a pasted Google Maps link or share text into a place (R-33-02). */
export async function resolvePlaceLink(
  tripId: string,
  input: { url?: string | null; text?: string | null },
): Promise<PlaceFromLink> {
  const text = input.text?.trim().slice(0, placeLinkLimits.text)
  const url = (input.url ?? text?.match(urlPattern)?.[0])?.slice(
    0,
    placeLinkLimits.url,
  )
  return requestJson(
    `/api/trips/${tripId}/places/from-link`,
    placeFromLinkSchema,
    {
      method: 'POST',
      body: JSON.stringify({
        ...(url ? { url } : {}),
        ...(text ? { text } : {}),
      }),
    },
  )
}

/** The translated reason a lookup failed. */
export function placeLinkError(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if ((placeLinkErrorCodes as readonly string[]).includes(error.code)) {
      return t(`places.errors.${error.code}`)
    }
    if (error.status === 429) return t('places.errors.rate_limited')
  }
  return t('places.errors.generic')
}
