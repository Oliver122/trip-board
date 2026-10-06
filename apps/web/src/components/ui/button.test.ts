import { describe, expect, it } from 'vitest'
import { buttonVariants } from './button'

const variants = ['default', 'outline', 'ghost', 'danger'] as const

describe('buttonVariants', () => {
  it('T-20-01 adds hover, pressed, and pointer styles, and disables them', () => {
    for (const variant of variants) {
      const classes = buttonVariants({ variant })
      expect(classes).toContain('hover:')
      expect(classes).toContain('active:')
      expect(classes).toContain('cursor-pointer')
      expect(classes).toContain('disabled:cursor-not-allowed')
      expect(classes).toMatch(/disabled:hover:/)
    }
    expect(buttonVariants({ variant: 'danger' })).toContain('border-danger')
    expect(buttonVariants({ variant: 'dangerSolid' })).toContain(
      'bg-danger-solid',
    )
  })
})
