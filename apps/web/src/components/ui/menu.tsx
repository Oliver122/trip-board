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

  const close = (restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
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
      {open ? (
        <MenuContext.Provider value={{ close }}>
          <div
            ref={popoverRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKey}
            className={cn(
              'absolute top-full z-40 mt-1 min-w-44 rounded-[8px] border border-border bg-card py-1 text-foreground shadow-panel',
              align === 'end' ? 'right-0' : 'left-0',
            )}
          >
            {children}
          </div>
        </MenuContext.Provider>
      ) : null}
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
