/** @vitest-environment jsdom */
/* eslint-disable tripboard/no-untranslated-jsx-text -- test fixtures */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from './button'
import { Menu, MenuItem, MenuLink } from './menu'

function setup(onSelect = vi.fn()) {
  render(
    <MemoryRouter>
      <Button>outside</Button>
      <Menu label="Actions" trigger="..." testId="trig">
        <MenuItem onSelect={onSelect}>One</MenuItem>
        <MenuItem onSelect={() => undefined}>Two</MenuItem>
        <MenuLink to="/x">Three</MenuLink>
      </Menu>
    </MemoryRouter>,
  )
  return screen.getByRole('button', { name: 'Actions' })
}

describe('menu', () => {
  afterEach(cleanup)

  it('T-26-03 opens with aria state and moves with arrow, Home and End keys', () => {
    const trigger = setup()
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(3)
    items[0]!.focus()
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1]!, { key: 'End' })
    expect(document.activeElement).toBe(items[2])
    fireEvent.keyDown(items[2]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0]!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[2])
    fireEvent.keyDown(items[2]!, { key: 'Home' })
    expect(document.activeElement).toBe(items[0])
  })

  it('T-26-03 Escape, Tab and outside click close it; select returns focus', () => {
    const onSelect = vi.fn()
    const trigger = setup(onSelect)

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0]!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0]!, { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(trigger)
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'One' }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('T-27-04 focuses the first item before any animation frame, so End reaches the menu', () => {
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 0)
    try {
      const trigger = setup()
      fireEvent.click(trigger)
      const items = screen.getAllByRole('menuitem')
      expect(document.activeElement).toBe(items[0])
      // A key pressed right after the menu shows goes to the focused element.
      fireEvent.keyDown(document.activeElement!, { key: 'End' })
      expect(document.activeElement).toBe(items[2])
    } finally {
      raf.mockRestore()
    }
  })

  it('T-27-04 ArrowUp on the trigger opens and focuses the last item at once', () => {
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 0)
    try {
      const trigger = setup()
      fireEvent.keyDown(trigger, { key: 'ArrowUp' })
      const items = screen.getAllByRole('menuitem')
      expect(document.activeElement).toBe(items[2])
    } finally {
      raf.mockRestore()
    }
  })
})
