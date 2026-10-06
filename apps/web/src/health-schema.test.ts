import { healthResponseSample, healthResponseSchema } from '@tripboard/shared'
import { describe, expect, it } from 'vitest'

describe('shared health schema', () => {
  it('accepts the same sample the api test uses', () => {
    expect(healthResponseSchema.parse(healthResponseSample)).toEqual({
      status: 'ok',
      db: 'ok',
    })
  })
})
