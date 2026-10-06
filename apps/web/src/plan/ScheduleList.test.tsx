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

  it('T-18-06 uses icon buttons and disables the ends', () => {
    renderList()
    const up = screen.getByRole('button', { name: 'Move Alpha up' })
    const down = screen.getByRole('button', { name: 'Move Beta down' })
    expect(up).toBeDisabled()
    expect(up.querySelector('svg')).toBeTruthy()
    expect(up).toHaveAttribute('title', 'Move Alpha up')
    expect(down).toBeDisabled()
    expect(down.querySelector('svg')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Move Alpha down' }),
    ).toBeEnabled()
    expect(screen.queryByText('Up')).not.toBeInTheDocument()
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
    expect(
      screen
        .getByRole('button', { name: 'Remove Alpha from Tokyo' })
        .querySelector('svg'),
    ).toBeTruthy()
  })

  it('announces the move and shows a drop line', () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }))
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
