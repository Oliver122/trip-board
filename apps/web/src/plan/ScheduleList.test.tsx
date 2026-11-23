/** @vitest-environment jsdom */
import type { PlanEntry } from '@tripboard/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { ScheduleList } from './ScheduleList'

const alpha = '40000000-0000-0000-0000-000000000001'
const beta = '40000000-0000-0000-0000-000000000002'

const entry: PlanEntry = {
  id: '30000000-0000-0000-0000-000000000001',
  tripId: '10000000-0000-0000-0000-000000000001',
  type: 'bucket',
  title: 'Tokyo',
  startDate: '2026-04-12',
  endDate: '2026-04-16',
  startTime: null,
  endTime: null,
  info: null,
  sortOrder: 0,
  outsideTripDates: false,
  home: null,
  spots: [
    {
      id: alpha,
      spotId: '20000000-0000-0000-0000-000000000001',
      title: 'Alpha',
      visitDate: null,
      visitTime: null,
      info: null,
      sortOrder: 0,
    },
    {
      id: beta,
      spotId: '20000000-0000-0000-0000-000000000002',
      title: 'Beta',
      visitDate: null,
      visitTime: null,
      info: null,
      sortOrder: 1,
    },
  ],
}

function renderList() {
  render(
    <ScheduleList
      entries={[entry]}
      spots={[]}
      canEdit
      selectedId={null}
      onSelect={() => undefined}
      onEdit={() => undefined}
      onAddSpot={async () => undefined}
      onRemoveSpot={async () => undefined}
      onReorder={async () => undefined}
      onCreateSpot={() => undefined}
      createdSpot={null}
    />,
  )
}

describe('schedule reorder controls', () => {
  beforeEach(async () => {
    cleanup()
    await i18n.changeLanguage('en')
  })

  // T-42-13: one ⋯ menu per row, impossible moves are not shown
  it('T-18-06 ends each row in one menu without the impossible move', () => {
    renderList()
    expect(
      screen.queryByRole('button', { name: 'Move Alpha down' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Alpha' }))
    expect(
      screen.queryByRole('menuitem', { name: 'Move up' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Move down' })).toBeVisible()
    expect(
      screen.getByRole('menuitem', { name: 'Remove from bucket' }),
    ).toBeVisible()
  })

  it('announces the move and shows a drop line', () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Alpha' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }))
    expect(screen.getByTestId(`visit-${alpha}`)).toHaveAttribute(
      'data-highlighted',
      'true',
    )
    expect(screen.getByTestId('reorder-live')).toHaveTextContent(
      'Alpha moved to position 2 of 2',
    )

    fireEvent.dragStart(screen.getByTestId(`drag-${beta}`))
    fireEvent.dragOver(screen.getByTestId(`visit-${alpha}`))
    expect(screen.getByTestId('drop-indicator')).toBeInTheDocument()
    expect(screen.getByTestId(`visit-${beta}`)).toHaveClass('opacity-40')
  })

  it('offers to create a spot when the picker is empty', () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Add spot' }))
    expect(
      screen.getByRole('option', { name: "Create new spot ''" }),
    ).toBeInTheDocument()
  })
})

const day = (
  n: number,
  link: Partial<PlanEntry['spots'][number]>,
  i: number,
) => ({
  id: `4000000${n}-0000-0000-0000-00000000000${i}`,
  spotId: `2000000${n}-0000-0000-0000-00000000000${i}`,
  title: `Visit ${n}${i}`,
  visitDate: null,
  visitTime: null,
  info: null,
  sortOrder: i,
  ...link,
})

const threeDays: PlanEntry = {
  ...entry,
  endDate: '2026-04-14',
  spots: [
    day(1, { visitDate: '2026-04-12', visitTime: '09:00' }, 1),
    day(1, { visitDate: '2026-04-12' }, 2),
    day(3, { visitDate: '2026-04-14' }, 1),
    day(0, {}, 1),
  ],
}

describe('schedule day groups', () => {
  beforeEach(async () => {
    cleanup()
    await i18n.changeLanguage('en')
  })

  it('T-46-02 groups a bucket by day with colour dot, count and numbers', () => {
    const [timed, untimed, third, any] = threeDays.spots
    render(
      <ScheduleList
        entries={[threeDays]}
        spots={[]}
        canEdit
        selectedId={null}
        tripStart="2026-04-12"
        onSelect={() => undefined}
        onEdit={() => undefined}
        onAddSpot={async () => undefined}
        onRemoveSpot={async () => undefined}
        onReorder={async () => undefined}
        onMoveSpot={async () => undefined}
        onCreateSpot={() => undefined}
        createdSpot={null}
      />,
    )
    const id = threeDays.id
    const groups = screen
      .getAllByTestId(/^day-group-/)
      .map((node) => node.getAttribute('data-testid'))
    expect(groups).toEqual([
      `day-group-${id}-2026-04-12`,
      `day-group-${id}-2026-04-14`,
      `day-group-${id}-any`,
    ])
    expect(screen.queryByTestId(`day-group-${id}-2026-04-13`)).toBeNull()
    const header = screen.getByTestId(`day-header-${id}-2026-04-12`)
    expect(header).toHaveTextContent(/Sun 12 Apr · 2 stops/)
    expect(header).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByTestId('day-dot')[0]).toHaveStyle({
      background: 'var(--day-1)',
    })
    expect(screen.getByTestId(`day-header-${id}-2026-04-14`)).toHaveTextContent(
      /1 stop$/,
    )
    expect(screen.getByTestId(`day-header-${id}-any`).tagName).toBe('H3')
    expect(screen.getByTestId(`stop-number-${timed?.id}`)).toHaveTextContent(
      '1',
    )
    expect(screen.getByTestId(`stop-number-${untimed?.id}`)).toHaveTextContent(
      '2',
    )
    expect(screen.getByTestId(`stop-number-${third?.id}`)).toHaveTextContent(
      '1',
    )
    expect(screen.getByTestId(`stop-number-${third?.id}`)).toHaveStyle({
      background: 'var(--day-3)',
    })
    expect(screen.queryByTestId(`stop-number-${any?.id}`)).toBeNull()
    expect(screen.getByTestId(`visit-${any?.id}`)).toHaveAttribute(
      'data-day',
      'any',
    )
  })

  it('T-46-02 gives a timed visit no Move up/down and opens Move to…', () => {
    const [timed, untimed] = threeDays.spots
    let moved: unknown[] = []
    render(
      <ScheduleList
        entries={[threeDays]}
        spots={[]}
        canEdit
        selectedId={null}
        tripStart="2026-04-12"
        onSelect={() => undefined}
        onEdit={() => undefined}
        onAddSpot={async () => undefined}
        onRemoveSpot={async () => undefined}
        onReorder={async () => undefined}
        onMoveSpot={async (...args) => {
          moved = args
        }}
        onCreateSpot={() => undefined}
        createdSpot={null}
      />,
    )
    fireEvent.click(screen.getByTestId(`row-menu-${timed?.id}`))
    expect(screen.queryByTestId(`move-up-${timed?.id}`)).toBeNull()
    expect(screen.queryByTestId(`move-down-${timed?.id}`)).toBeNull()
    fireEvent.click(screen.getByTestId(`move-to-${timed?.id}`))
    expect(screen.getByTestId('move-dialog')).toBeVisible()
    fireEvent.click(
      screen.getByTestId(`move-option-${threeDays.id}-2026-04-13`),
    )
    expect(moved).toEqual([threeDays.id, timed?.id, threeDays.id, '2026-04-13'])
    expect(screen.getByTestId('reorder-live')).toHaveTextContent(
      'Moved to Mon 13 Apr, stop 1',
    )
    // the untimed visit of day 1 is alone in its untimed list
    fireEvent.click(screen.getByTestId(`row-menu-${untimed?.id}`))
    expect(screen.queryByTestId(`move-up-${untimed?.id}`)).toBeNull()
  })
})
