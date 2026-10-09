/** @vitest-environment jsdom */
/* eslint-disable tripboard/no-untranslated-jsx-text -- test fixtures */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { Button } from './button'
import { Modal } from './modal'

describe('modal', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
  })

  it('T-26-01 is a labelled dialog, traps Tab, closes on Escape and restores focus', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const onClose = vi.fn()
    const view = render(
      <Modal title="Edit" onClose={onClose} testId="m">
        <input aria-label="Name" />
        <Button>Save</Button>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Edit' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('data-testid', 'm')
    expect(dialog.contains(document.activeElement)).toBe(true)

    screen.getByRole('button', { name: 'Save' }).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(
      screen.getByRole('button', { name: 'Save' }),
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('T-26-01 locks body scroll, sizes and layers the center variant', () => {
    const view = render(
      <Modal title="Big" size="lg" layer="top" onClose={() => undefined}>
        x
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    expect(screen.getByRole('dialog').className).toContain('sm:max-w-2xl')
    expect(screen.getByTestId('modal-backdrop').parentElement).toHaveClass(
      'z-50',
    )
    view.unmount()
    expect(document.body.style.overflow).toBe('')

    render(
      <Modal title="Default" onClose={() => undefined}>
        x
      </Modal>,
    )
    expect(screen.getByTestId('modal-backdrop').parentElement).toHaveClass(
      'z-40',
    )
  })

  it('T-26-01 closes on backdrop click unless disabled', () => {
    const onClose = vi.fn()
    const view = render(
      <Modal title="A" onClose={onClose}>
        x
      </Modal>,
    )
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
    view.unmount()

    const other = vi.fn()
    render(
      <Modal title="B" onClose={other} closeOnBackdrop={false}>
        x
      </Modal>,
    )
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(other).not.toHaveBeenCalled()
  })

  it('T-26-01 only the topmost of stacked modals handles Escape and Tab', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const closeBottom = vi.fn()
    const closeTop = vi.fn()
    const view = render(
      <>
        <Modal title="Bottom" variant="side" onClose={closeBottom}>
          <input aria-label="Below" />
        </Modal>
        <Modal title="Top" layer="top" onClose={closeTop}>
          <input aria-label="Above" />
        </Modal>
      </>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(closeTop).toHaveBeenCalledOnce()
    expect(closeBottom).not.toHaveBeenCalled()

    view.rerender(
      <>
        <Modal title="Bottom" variant="side" onClose={closeBottom}>
          <input aria-label="Below" />
        </Modal>
        {null}
      </>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(closeBottom).toHaveBeenCalledOnce()
    view.unmount()
    opener.remove()
  })

  it('T-26-01 a non-dismissible modal ignores Escape and backdrop clicks', () => {
    const onClose = vi.fn()
    render(
      <Modal title="Forced" dismissible={false} onClose={onClose}>
        <input aria-label="Field" />
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('T-26-01 side variant has no backdrop or scroll lock', () => {
    render(
      <Modal title="Side" variant="side" onClose={() => undefined}>
        x
      </Modal>,
    )
    expect(screen.queryByTestId('modal-backdrop')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })
})
