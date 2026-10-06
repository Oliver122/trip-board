/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { categories } from '../components/category'
import { Pin } from './Pin'

describe('Pin', () => {
  it('T-05-04 uses the category color variable and icon', () => {
    for (const category of categories) {
      const { unmount } = render(<Pin category={category} label="Spot" />)
      const pin = screen.getByRole('button', { name: 'Spot' })
      expect(pin.getAttribute('style')).toContain(`var(--cat-${category})`)
      expect(pin.querySelector(`[data-icon="${category}"]`)).not.toBeNull()
      unmount()
    }
  })

  it('T-05-04 marks the selected state', () => {
    render(<Pin category="must-go" label="Spot" selected />)
    expect(screen.getByRole('button', { name: 'Spot' })).toHaveClass(
      'is-selected',
    )
  })
})
