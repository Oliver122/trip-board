import {
  apiErrorBodySchema,
  fileSizeLimits,
  imageListSchema,
  imageSchema,
  photoSuggestionListSchema,
  quotaSchema,
  type ApiErrorBody,
  type ImageList,
  type PhotoSuggestion,
  type Quota,
  type SpotImage,
} from '@tripboard/shared'
import { ApiError, request, requestJson } from '../api/http'

export async function listImages(
  spotId: string,
  signal?: AbortSignal,
): Promise<ImageList> {
  return requestJson(`/api/spots/${spotId}/images`, imageListSchema, {
    signal,
  })
}

let lastMaxFileBytes: number | null = null

/** The per-file limit of the last quota read, or the default before any read. */
export function knownMaxFileBytes(): number {
  return lastMaxFileBytes ?? fileSizeLimits.default
}

export async function getQuota(signal?: AbortSignal): Promise<Quota> {
  const quota = await requestJson('/api/me/quota', quotaSchema, { signal })
  lastMaxFileBytes = quota.maxFileBytes
  return quota
}

export function imageSrc(url: string): string {
  return url.startsWith('/api/') ? url : `/api${url}`
}

function readErrorBody(text: string): ApiErrorBody | null {
  try {
    const parsed = apiErrorBodySchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function uploadImage(
  spotId: string,
  file: File,
  onProgress: (ratio: number) => void,
): Promise<SpotImage> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/spots/${spotId}/images`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total)
      }
    }
    xhr.onload = () => {
      if (xhr.status === 401) {
        reject(new ApiError(401))
        return
      }
      if (xhr.status === 201) {
        resolve(imageSchema.parse(JSON.parse(xhr.responseText)))
        return
      }
      if (xhr.status === 503) {
        reject(new Error('paused'))
        return
      }
      if (xhr.status === 413) {
        reject(new ApiError(413, readErrorBody(xhr.responseText)))
        return
      }
      reject(new Error('upload'))
    }
    xhr.onerror = () => reject(new Error('upload'))
    const body = new FormData()
    body.append('file', file)
    onProgress(0)
    xhr.send(body)
  })
}

export async function deleteImage(imageId: string): Promise<void> {
  await request(`/api/images/${imageId}`, { method: 'DELETE' })
}

export function addImageFromUrl(
  spotId: string,
  url: string,
): Promise<SpotImage> {
  return requestJson(`/api/spots/${spotId}/images/from-url`, imageSchema, {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export function addImageFromCommons(
  spotId: string,
  fileTitle: string,
): Promise<SpotImage> {
  return requestJson(`/api/spots/${spotId}/images/from-commons`, imageSchema, {
    method: 'POST',
    body: JSON.stringify({ fileTitle }),
  })
}

export async function listPhotoSuggestions(
  tripId: string,
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<PhotoSuggestion[]> {
  const query = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  const list = await requestJson(
    `/api/trips/${tripId}/photo-suggestions?${query}`,
    photoSuggestionListSchema,
    { signal },
  )
  return list.suggestions
}
