import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/http'
import i18n from '../i18n'
import { photoErrorMessage } from './reasons'

const MiB = 1024 * 1024
const en = i18n.getFixedT('en') as TFunction
const de = i18n.getFixedT('de') as TFunction

describe('photo error text', () => {
  it('T-43-10 names the limit from the 413 body', () => {
    const error = new ApiError(413, {
      error: 'too_large',
      maxFileBytes: 20 * MiB,
    })
    expect(photoErrorMessage(error, en)).toBe('The image is larger than 20 MB.')
    expect(photoErrorMessage(error, de)).toBe('Das Bild ist größer als 20 MB.')
  })

  it('T-43-10 keeps the image limit text for quota_exceeded', () => {
    const error = new ApiError(413, { error: 'quota_exceeded' })
    expect(photoErrorMessage(error, en)).toBe(en('board.imageLimit'))
  })

  it('T-43-10 falls back to the known limit when the body has none', () => {
    const error = new ApiError(413, null)
    expect(photoErrorMessage(error, en)).toMatch(
      /^The image is larger than \d+ MB\.$/,
    )
  })
})
