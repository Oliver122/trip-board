import { describe, expect, it } from 'vitest'
import { commentBodySchema, commentExcerpt } from '@tripboard/shared'

describe('comment body', () => {
  it('T-24-02 trims the body and accepts 1 and 2000 characters', () => {
    expect(commentBodySchema.parse({ body: '  hi  ' })).toEqual({ body: 'hi' })
    expect(commentBodySchema.parse({ body: 'x' }).body).toBe('x')
    expect(
      commentBodySchema.parse({ body: 'x'.repeat(2000) }).body,
    ).toHaveLength(2000)
  })

  it('T-24-02 rejects blank and 2001-character bodies', () => {
    expect(commentBodySchema.safeParse({ body: '   ' }).success).toBe(false)
    expect(commentBodySchema.safeParse({ body: '' }).success).toBe(false)
    expect(
      commentBodySchema.safeParse({ body: 'x'.repeat(2001) }).success,
    ).toBe(false)
  })

  it('keeps the News excerpt to 140 characters', () => {
    expect(commentExcerpt('a'.repeat(300))).toHaveLength(140)
    expect(commentExcerpt('short')).toBe('short')
  })
})
