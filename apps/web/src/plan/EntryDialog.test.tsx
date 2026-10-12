/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { EntryDialog } from './EntryDialog'

function renderDialog() {
  render(
    <EntryDialog
      mode="edit"
      type="single"
      initial={{
        type: 'single',
        title: 'Dinner',
        startDate: '2026-04-12',
        endDate: null,
        startTime: null,
        endTime: null,
        info: null,
      }}
      visits={[]}
      saving={false}
      onClose={() => undefined}
      onSave={() => undefined}
      onDelete={() => undefined}
    />,
  )
}

describe('entry dialog delete control', () => {
  beforeEach(async () => {
    cleanup()
    await i18n.changeLanguage('en')
  })

  it('T-31-07 delete is an icon-only button with a name and title', () => {
    renderDialog()
    const button = screen.getByRole('button', { name: 'Delete entry' })
    expect(button).toHaveAttribute('title', 'Delete entry')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.textContent).toBe('')
  })

  it('T-31-07 delete is named in German', async () => {
    await i18n.changeLanguage('de')
    renderDialog()
    expect(
      screen.getByRole('button', { name: 'Eintrag löschen' }),
    ).toHaveAttribute('title', 'Eintrag löschen')
  })

  it('T-31-07 confirm row shows, Cancel returns focus to the trash button', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }))
    expect(screen.getByTestId('entry-delete-confirm')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByTestId('entry-delete-confirm')).toBeNull()
    expect(screen.getByTestId('entry-delete')).toHaveFocus()
  })
})
