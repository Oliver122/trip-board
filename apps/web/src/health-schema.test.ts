import { healthResponseSample, healthResponseSchema } from '@tripboard/shared'
import { describe, expect, it } from 'vitest'

// T-00-03 (web side; the api side is apps/api/src/health.test.ts)
describe('shared health schema', () => {
  it('accepts the same sample the api test uses', () => {
    expect(healthResponseSchema.parse(healthResponseSample)).toEqual({
      status: 'ok',
      db: 'ok',
    })
  })
})
