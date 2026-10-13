import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { cn } from '../../lib/utils'
import { hoverClass } from './hover'

const MenuContext = createContext<{
  close: (restoreFocus?: boolean) => void
} | null>(null)

const itemBase =
  'flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm outline-none focus-visible:bg-hover'

export function Menu({
  label,
  trigger,
  triggerClassName,
  align = 'end',
  children,
  testId,
}: {
  label: string
  trigger: ReactNode
  triggerClassName?: string
  align?: 'start' | 'end'
  children: ReactNode
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const pendingFocus = useRef<'first' | 'last' | null>(null)
  /** Trigger position the popover was placed against. */
  const placedAt = useRef<{ top: number; left: number } | null>(null)

  const close = (restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node
      if (
        !rootRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      )
        setOpen(false)
    }
    // A scrolled ancestor of the trigger (or the page) moves the trigger away
    // from the fixed popover; scrolling inside the popover is fine. Only a
    // scroll that really moved the trigger closes it: the scroll event of a
    // click that first brought the trigger into view can land after opening.
    const onScroll = (event: Event) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target)) return
      if (target !== document && !target.contains(triggerRef.current)) return
      const placed = placedAt.current
      const now = triggerRef.current?.getBoundingClientRect()
      if (
        placed &&
        now &&
        Math.abs(now.top - placed.top) < 1 &&
        Math.abs(now.left - placed.left) < 1
      )
        return
      setOpen(false)
    }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const items = () => [
    ...(popoverRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]',
    ) ?? []),
  ]

  const focusAt = (index: number) => {
    const list = items()
    if (list.length === 0) return
    list[(index + list.length) % list.length]?.focus()
  }

  const openAndFocus = (which: 'first' | 'last') => {
    pendingFocus.current = which
    setOpen(true)
  }

  // Place the portaled popover next to the trigger, flipped and clamped to the
  // viewport, before the browser paints it.
  useLayoutEffect(() => {
    const pop = popoverRef.current
    const trig = triggerRef.current
    if (!open || !pop || !trig) return
    const margin = 8
    const gap = 4
    pop.style.maxHeight = ''
    pop.style.overflowY = ''
    const t = trig.getBoundingClientRect()
    placedAt.current = { top: t.top, left: t.left }
    const { width, height } = pop.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const below = vh - t.bottom - gap - margin
    const above = t.top - gap - margin
    let top: number
    if (height <= below) top = t.bottom + gap
    else if (height <= above) top = t.top - gap - height
    else {
      const useBelow = below >= above
      const room = Math.max(0, useBelow ? below : above)
      pop.style.maxHeight = `${room}px`
      pop.style.overflowY = 'auto'
      top = useBelow ? t.bottom + gap : t.top - gap - room
    }
    const left = align === 'end' ? t.right - width : t.left
    pop.style.top = `${top}px`
    pop.style.left = `${Math.max(margin, Math.min(left, vw - margin - width))}px`
  }, [open, align])

  // Focus moves before the browser paints the menu, so a key pressed as soon
  // as the menu is visible already reaches an item.
  useLayoutEffect(() => {
    if (!open || !pendingFocus.current) return
    const which = pendingFocus.current
    pendingFocus.current = null
    const list = items()
    ;(which === 'first' ? list[0] : list[list.length - 1])?.focus()
  }, [open])

  const onTriggerKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openAndFocus('first')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAndFocus('last')
    }
  }

  const onMenuKey = (event: KeyboardEvent) => {
    const list = items()
    const index = list.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusAt(index + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusAt(index < 0 ? -1 : index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusAt(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusAt(-1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        data-testid={testId}
        className={cn(
          hoverClass.ghost,
          'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[8px] px-2',
          triggerClassName,
        )}
        onClick={() => (open ? close() : openAndFocus('first'))}
        onKeyDown={onTriggerKey}
      >
        {trigger}
      </button>
      {open
        ? createPortal(
            <MenuContext.Provider value={{ close }}>
              <div
                ref={popoverRef}
                id={menuId}
                role="menu"
                aria-label={label}
                onKeyDown={onMenuKey}
                className="fixed top-0 left-0 z-50 min-w-44 rounded-[8px] border border-border bg-card py-1 text-foreground shadow-panel"
              >
                {children}
              </div>
            </MenuContext.Provider>,
            document.body,
          )
        : null}
    </div>
  )
}

export function MenuItem({
  onSelect,
  children,
  danger,
  testId,
}: {
  onSelect: () => void
  children: ReactNode
  danger?: boolean
  testId?: string
}) {
  const menu = useContext(MenuContext)
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-testid={testId}
      className={cn(hoverClass.item, itemBase, danger && 'text-danger')}
      onClick={() => {
        menu?.close()
        onSelect()
      }}
    >
      {children}
    </button>
  )
}

export function MenuLink({
  to,
  children,
  testId,
}: {
  to: string
  children: ReactNode
  testId?: string
}) {
  const menu = useContext(MenuContext)
  return (
    <Link
      to={to}
      role="menuitem"
      tabIndex={-1}
      data-testid={testId}
      className={cn(hoverClass.item, itemBase)}
      onClick={() => menu?.close(false)}
    >
      {children}
    </Link>
  )
}
