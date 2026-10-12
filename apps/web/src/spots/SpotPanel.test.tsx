/** @vitest-environment jsdom */
import type { Spot } from '@tripboard/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../components/ui/confirm'
import i18n from '../i18n'
import { emptyDraft } from './model'
import { SpotPanel } from './SpotPanel'

vi.mock('../trips/trip-context', () => ({
  useTripData: () => ({ imageRevision: 0 }),
}))
vi.mock('../kinds/store', () => ({
  useTripKinds: () => ({ kinds: [] }),
}))
vi.mock('../images/Gallery', () => ({ Gallery: () => null }))
vi.mock('./InPlans', () => ({ InPlans: () => null }))
vi.mock('../comments/SpotDiscussion', () => ({ SpotDiscussion: () => null }))

const spot = { id: 's1', commentCount: 0, createdBy: null } as unknown as Spot

function renderPanel() {
  render(
    <ConfirmProvider>
      <SpotPanel
        mode="edit"
        draft={{ ...emptyDraft, title: 'Alpha' }}
        tripId="t1"
        lang="en"
        saving={false}
        spot={spot}
        spots={[]}
        plans={[]}
        entries={[]}
        onDraft={() => undefined}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onDelete={() => undefined}
        onAddToPlan={async () => undefined}
        onRemoveFromPlan={async () => undefined}
        onToast={() => undefined}
      />
    </ConfirmProvider>,
  )
}

describe('spot panel delete control', () => {
  beforeEach(async () => {
    cleanup()
    await i18n.changeLanguage('en')
  })

  it('T-31-07 delete is an icon-only button with a name and title', () => {
    renderPanel()
    const button = screen.getByRole('button', { name: 'Delete spot' })
    expect(button).toHaveAttribute('title', 'Delete spot')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.textContent).toBe('')
  })

  it('T-31-07 delete is named in German', async () => {
    await i18n.changeLanguage('de')
    renderPanel()
    expect(screen.getByRole('button', { name: 'Ort löschen' })).toHaveAttribute(
      'title',
      'Ort löschen',
    )
  })

  it('T-31-07 confirm row shows, Cancel returns focus to the trash button', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Delete spot' }))
    expect(screen.getByTestId('spot-delete-confirm')).toHaveTextContent(
      'Delete this spot?',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByTestId('spot-delete-confirm')).toBeNull()
    expect(screen.getByTestId('spot-delete')).toHaveFocus()
  })

  it('T-31-05 the panel body keeps scrolling to itself', () => {
    renderPanel()
    const body = screen.getByTestId('spot-panel-body')
    expect(body).toHaveClass('overscroll-contain')
    expect(body).toHaveAttribute('data-modal-body')
  })
})
