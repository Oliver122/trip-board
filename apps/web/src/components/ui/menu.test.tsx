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

  it('T-32-05 renders the menu in document.body, outside an overflow-hidden parent', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <MemoryRouter>
        <Button>outside</Button>
        <div style={{ overflow: 'hidden', height: '50px' }} data-testid="clip">
          <Menu label="Actions" trigger="...">
            <MenuItem onSelect={onSelect}>One</MenuItem>
            <MenuItem onSelect={() => undefined}>Two</MenuItem>
          </Menu>
        </div>
      </MemoryRouter>,
    )
    const trigger = screen.getByRole('button', { name: 'Actions' })
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu')
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(screen.getByTestId('clip').contains(menu)).toBe(false)
    expect(menu.parentElement).toBe(document.body)
    expect(trigger).toHaveAttribute('aria-controls', menu.id)

    const items = screen.getAllByRole('menuitem')
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1]!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0]!, { key: 'End' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1]!, { key: 'Home' })
    expect(document.activeElement).toBe(items[0])

    fireEvent.mouseDown(menu)
    expect(screen.queryByRole('menu')).not.toBeNull()

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(document.body)

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0]!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'One' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  describe('T-32-05 placement', () => {
    const originalHeight = window.innerHeight
    let rect: typeof HTMLElement.prototype.getBoundingClientRect
    afterEach(() => {
      window.innerHeight = originalHeight
      HTMLElement.prototype.getBoundingClientRect = rect
    })

    function mockRects(triggerTop: number, popHeight: number) {
      rect = HTMLElement.prototype.getBoundingClientRect
      HTMLElement.prototype.getBoundingClientRect = function () {
        const box = (top: number, w: number, h: number) =>
          ({
            top,
            bottom: top + h,
            left: 100,
            right: 100 + w,
            width: w,
            height: h,
            x: 100,
            y: top,
            toJSON: () => ({}),
          }) as DOMRect
        return this.getAttribute('role') === 'menu'
          ? box(0, 176, popHeight)
          : box(triggerTop, 44, 44)
      }
    }

    it('T-32-05 flips above when there is no room below', () => {
      window.innerHeight = 300
      mockRects(240, 100)
      fireEvent.click(setup())
      const top = parseFloat(screen.getByRole('menu').style.top)
      expect(top).toBe(240 - 4 - 100)
      expect(screen.getByRole('menu').style.maxHeight).toBe('')
    })

    it('T-32-05 gets a max-height when neither side fits', () => {
      window.innerHeight = 300
      mockRects(120, 400)
      fireEvent.click(setup())
      const menu = screen.getByRole('menu')
      expect(menu.style.maxHeight).not.toBe('')
      expect(parseFloat(menu.style.maxHeight)).toBeLessThan(400)
      expect(menu.style.overflowY).toBe('auto')
    })
  })

  it('T-32-05 closes when a scroll moves the trigger, not on a stale or inner scroll', () => {
    const trigger = setup()
    let top = 100
    trigger.getBoundingClientRect = () =>
      ({
        top,
        left: 10,
        bottom: top + 44,
        right: 54,
        width: 44,
        height: 44,
      }) as DOMRect
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu')
    // Scroll inside the popover, and a late scroll event that did not move
    // the trigger, both keep it open.
    fireEvent.scroll(menu)
    fireEvent.scroll(document)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    top = 60
    fireEvent.scroll(document)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
