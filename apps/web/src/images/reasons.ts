import type { TFunction } from 'i18next'
import { ApiError } from '../api/http'

const codeKeys: Record<string, string> = {
  url_not_allowed: 'images.errors.url_not_allowed',
  fetch_failed: 'images.errors.fetch_failed',
  commons_failed: 'images.errors.commons_failed',
  license_not_allowed: 'images.errors.license_not_allowed',
  already_added: 'images.errors.already_added',
  too_large: 'images.errors.too_large',
  quota_exceeded: 'board.imageLimit',
  uploads_paused: 'board.uploadsPaused',
}

/** A translated reason a photo could not be added, from an upload or web-photo failure. */
export function photoErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    const key = codeKeys[error.code]
    if (key) return t(key)
    if (error.status === 400 && error.fields.url) {
      return t('images.errors.invalid_url')
    }
    if (error.status === 413) return t('images.errors.too_large')
    if (error.status === 415) return t('images.errors.unsupported_type')
    if (error.status === 429) return t('images.errors.rate_limited')
    if (error.status === 503) return t('board.uploadsPaused')
    return t('board.imageError')
  }
  const code = error instanceof Error ? error.message : ''
  if (code === 'paused') return t('board.uploadsPaused')
  if (code === 'quota') return t('board.imageLimit')
  return t('board.imageError')
}
