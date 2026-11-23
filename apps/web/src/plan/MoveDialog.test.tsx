/** @vitest-environment jsdom */
import type { PlanEntry } from '@tripboard/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { MoveDialog } from './MoveDialog'

const base = {
  tripId: '10000000-0000-0000-0000-000000000001',
  startTime: null,
  endTime: null,
  info: null,
  sortOrder: 0,
  outsideTripDates: false,
  home: null,
}
const link = {
  id: '40000000-0000-0000-0000-000000000001',
  spotId: '20000000-0000-0000-0000-000000000001',
  title: 'Alpha',
  visitDate: '2026-04-13',
  visitTime: null,
  info: null,
  sortOrder: 0,
}
const bucket: PlanEntry = {
  ...base,
  id: '30000000-0000-0000-0000-000000000001',
  type: 'bucket',
  title: 'Tokyo',
  startDate: '2026-04-12',
  endDate: '2026-04-14',
  spots: [link],
}
const single: PlanEntry = {
  ...base,
  id: '30000000-0000-0000-0000-000000000002',
  type: 'single',
  title: 'Flight',
  startDate: '2026-04-20',
  endDate: null,
  spots: [],
}

describe('MoveDialog', () => {
  beforeEach(async () => {
    cleanup()
    await i18n.changeLanguage('en')
  })

  it('T-46-04 lists the days of every entry and disables the current place', () => {
    const onPick = vi.fn()
    render(
      <MoveDialog
        entries={[bucket, single]}
        fromEntryId={bucket.id}
        link={link}
        locale="en"
        onPick={onPick}
        onClose={() => undefined}
      />,
    )
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-testid',
      'move-dialog',
    )
    for (const date of ['2026-04-12', '2026-04-13', '2026-04-14']) {
      expect(
        screen.getByTestId(`move-option-${bucket.id}-${date}`),
      ).toBeVisible()
    }
    expect(screen.getByTestId(`move-option-${bucket.id}-any`)).toBeEnabled()
    expect(
      screen.getByTestId(`move-option-${single.id}-2026-04-20`),
    ).toBeVisible()
    expect(screen.getByTestId(`move-option-${single.id}-any`)).toBeVisible()
    const current = screen.getByTestId(`move-option-${bucket.id}-2026-04-13`)
    expect(current).toBeDisabled()
    expect(current).toHaveAttribute('aria-current', 'true')
    fireEvent.click(screen.getByTestId(`move-option-${single.id}-any`))
    expect(onPick).toHaveBeenCalledWith(single.id, null)
  })
})
