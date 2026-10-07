import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function Dialog({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string
  closeLabel: string
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement
    const panel = panelRef.current
    focusable(panel)[0]?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const items = focusable(panel)
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      const active = lightElement(document.activeElement)
      if (!(active instanceof HTMLElement) || !panel.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (
        active instanceof HTMLInputElement &&
        (active.type === 'date' || active.type === 'time')
      ) {
        const index = items.indexOf(active)
        const next = items[index + (event.shiftKey ? -1 : 1)]
        if (next) {
          event.preventDefault()
          next.focus()
        }
        return
      }
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex justify-end">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pointer-events-auto relative flex h-full w-full max-w-md flex-col bg-card text-foreground shadow-panel max-sm:max-w-none sm:mr-[280px] lg:mr-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            className={cn(
              hoverClass.ghost,
              'inline-flex size-11 items-center justify-center rounded-[8px]',
            )}
            aria-label={closeLabel}
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function lightElement(node: Element | null): Element | null {
  let current = node
  while (current) {
    const root = current.getRootNode()
    if (!(root instanceof ShadowRoot)) return current
    current = root.host
  }
  return null
}

function focusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) => element.getAttribute('aria-hidden') !== 'true',
  )
}
