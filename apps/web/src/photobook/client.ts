import {
  apiErrorBodySchema,
  photoListSchema,
  photoSchema,
  type ApiErrorBody,
  type PatchImageBody,
  type Photo,
  type PhotoList,
} from '@tripboard/shared'
import { ApiError, requestJson } from '../api/http'

export function listPhotos(
  tripId: string,
  signal?: AbortSignal,
): Promise<PhotoList> {
  return requestJson(`/api/trips/${tripId}/photos`, photoListSchema, {
    signal,
  })
}

export function patchPhoto(
  imageId: string,
  body: PatchImageBody,
): Promise<Photo> {
  return requestJson(`/api/images/${imageId}`, photoSchema, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function readErrorBody(text: string): ApiErrorBody | null {
  try {
    const parsed = apiErrorBodySchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** One photo with XHR progress; every failure is an `ApiError` (status 0 = network). */
export function uploadPhoto(
  tripId: string,
  body: FormData,
  onProgress: (ratio: number) => void,
): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/trips/${tripId}/photos`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total)
      }
    }
    xhr.onload = () => {
      if (xhr.status === 201) {
        try {
          resolve(photoSchema.parse(JSON.parse(xhr.responseText)))
        } catch {
          reject(new ApiError(500))
        }
        return
      }
      reject(new ApiError(xhr.status, readErrorBody(xhr.responseText)))
    }
    xhr.onerror = () => reject(new ApiError(0))
    onProgress(0)
    xhr.send(body)
  })
}
