import {
  imageListSchema,
  imageSchema,
  quotaSchema,
  type ImageList,
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

export async function getQuota(signal?: AbortSignal): Promise<Quota> {
  return requestJson('/api/me/quota', quotaSchema, { signal })
}

export function imageSrc(url: string): string {
  return url.startsWith('/api/') ? url : `/api${url}`
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
        reject(new Error('quota'))
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
