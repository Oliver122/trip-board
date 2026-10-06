/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { clearedVisitCount } from './dates'
import { VisitDatePicker } from './VisitDatePicker'

describe('VisitDatePicker', () => {
  beforeEach(async () => {
    cleanup()
    await i18n.changeLanguage('en')
  })

  it('T-11-08 disables dates outside the bucket range', () => {
    const onChange = vi.fn()
    render(
      <VisitDatePicker
        start="2026-04-12"
        end="2026-04-16"
        value={null}
        onChange={onChange}
        label="Visit date"
      />,
    )

    const before = screen.getByRole('button', { name: '2026-04-11' })
    const inside = screen.getByRole('button', { name: '2026-04-13' })
    const after = screen.getByRole('button', { name: '2026-04-17' })
    expect(before).toBeDisabled()
    expect(after).toBeDisabled()
    expect(inside).toBeEnabled()

    fireEvent.click(before)
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(inside)
    expect(onChange).toHaveBeenCalledWith('2026-04-13')
  })

  it('counts visit dates that a shorter bucket would clear', () => {
    const visits = [
      { visitDate: '2026-04-13' },
      { visitDate: '2026-04-15' },
      { visitDate: null },
    ]
    expect(clearedVisitCount(visits, '2026-04-12', '2026-04-14')).toBe(1)
    expect(clearedVisitCount(visits, '2026-04-12', '2026-04-16')).toBe(0)
    expect(i18n.t('schedule.clearWarning', { count: 1 })).toBe(
      '1 visit date will be cleared',
    )
    expect(i18n.t('schedule.clearWarning', { count: 2 })).toBe(
      '2 visit dates will be cleared',
    )
  })
})
