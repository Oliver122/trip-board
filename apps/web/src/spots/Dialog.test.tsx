/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { Dialog } from './Dialog'

describe('spot dialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('T-07-11 is a labelled dialog, traps tab, closes on Escape, and restores focus', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Add new'
    document.body.append(opener)
    opener.focus()
    const onClose = vi.fn()
    const label = 'Add'
    const view = render(
      <Dialog title="New spot" closeLabel="Close" onClose={onClose}>
        <input aria-label="Title" />
        <button type="button">{label}</button>
      </Dialog>,
    )

    const dialog = screen.getByRole('dialog', { name: 'New spot' })
    expect(dialog).toBeInTheDocument()
    expect(dialog.contains(document.activeElement)).toBe(true)

    const add = screen.getByRole('button', { name: 'Add' })
    add.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(add)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
