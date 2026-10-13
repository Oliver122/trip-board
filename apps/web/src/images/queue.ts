// Photos picked in add mode wait here until the spot exists (R-34-12, R-34-13).
import type { TFunction } from 'i18next'
import { addImageFromCommons, addImageFromUrl, uploadImage } from './client'
import { photoErrorMessage } from './reasons'

/** A photo picked in add mode, sent once the spot exists. */
export type QueuedPhoto =
  | { id: string; kind: 'file'; file: File; preview: string; label: string }
  | { id: string; kind: 'url'; url: string; preview: string; label: string }
  | {
      id: string
      kind: 'commons'
      fileTitle: string
      preview: string
      label: string
    }

export type QueueResult = {
  /** Photos that could not be added, with a translated reason. */
  failed: { photo: QueuedPhoto; reason: string }[]
}

/** Sends the queued photos to a new spot, one after another, in order. */
export async function sendQueuedPhotos(
  spotId: string,
  photos: readonly QueuedPhoto[],
  t: TFunction,
): Promise<QueueResult> {
  const failed: QueueResult['failed'] = []
  for (const photo of photos) {
    try {
      if (photo.kind === 'file') {
        await uploadImage(spotId, photo.file, () => undefined)
      } else if (photo.kind === 'url') {
        await addImageFromUrl(spotId, photo.url)
      } else {
        await addImageFromCommons(spotId, photo.fileTitle)
      }
    } catch (error) {
      failed.push({ photo, reason: photoErrorMessage(error, t) })
    }
  }
  return { failed }
}

/** The one toast after *Add* when photos failed, or null (R-34-13). */
export function queueFailureMessage(
  result: QueueResult,
  t: TFunction,
): string | null {
  if (result.failed.length === 0) return null
  const details = result.failed
    .map(({ photo, reason }) => `${photo.label}: ${reason}`)
    .join('; ')
  return t('images.queueFailed', { count: result.failed.length, details })
}
