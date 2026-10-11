import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { hoverClass } from './hover'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Open modals, oldest first; only the last one handles Escape and Tab. */
const modalStack: object[] = []

const layerClass = { panel: 'z-20', modal: 'z-40', top: 'z-50' } as const
const sizeClass = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }

export function Modal({
  title,
  closeLabel,
  onClose,
  variant = 'center',
  size = 'md',
  layer,
  closeOnBackdrop = true,
  dismissible = true,
  footer,
  initialFocus,
  testId,
  children,
}: {
  title: string
  closeLabel?: string
  onClose: () => void
  variant?: 'center' | 'side'
  /** Center only; full-screen below 640px. */
  size?: 'sm' | 'md' | 'lg'
  layer?: 'panel' | 'modal' | 'top'
  closeOnBackdrop?: boolean
  /** False for forced choices: no close button, no Escape, no backdrop close. */
  dismissible?: boolean
  footer?: ReactNode
  initialFocus?: RefObject<HTMLElement | null>
  testId?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const dismissibleRef = useRef(dismissible)
  dismissibleRef.current = dismissible
  const side = variant === 'side'
  const layerName = layer ?? (side ? 'panel' : 'modal')

  useEffect(() => {
    const previous = document.activeElement
    const panel = panelRef.current
    const token = {}
    modalStack.push(token)
    if (initialFocus?.current) initialFocus.current.focus()
    else focusable(panel)[0]?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token) return
      if (event.key === 'Escape') {
        // An open menu inside the modal closes itself first (R-26-03); this
        // capture listener would otherwise close the whole modal.
        const target = event.target
        if (target instanceof Element && target.closest('[role="menu"]')) {
          return
        }
        event.preventDefault()
        if (dismissibleRef.current) onCloseRef.current()
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
          event.stopPropagation()
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
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      const index = modalStack.indexOf(token)
      if (index >= 0) modalStack.splice(index, 1)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  useEffect(() => {
    if (side) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [side])

  const header = (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      {dismissible ? (
        <button
          type="button"
          className={cn(
            hoverClass.ghost,
            'inline-flex size-11 items-center justify-center rounded-[8px]',
          )}
          aria-label={closeLabel ?? t('ui.close')}
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  )

  if (side) {
    return (
      <div
        className={cn(
          'pointer-events-none fixed inset-0 flex justify-end',
          layerName === 'top' ? 'z-50' : 'z-40',
        )}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid={testId}
          className="pointer-events-auto relative flex h-full w-full max-w-md flex-col bg-card text-foreground shadow-panel max-sm:max-w-none sm:mr-[280px] lg:mr-0"
        >
          {header}
          {children}
          {footer ? <ModalFooter>{footer}</ModalFooter> : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'fixed inset-0 flex items-stretch justify-center sm:items-center sm:p-4',
        layerClass[layerName],
      )}
    >
      <div
        data-testid="modal-backdrop"
        aria-hidden="true"
        className="absolute inset-0 bg-foreground/40"
        onClick={closeOnBackdrop && dismissible ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className={cn(
          'relative flex h-full w-full flex-col bg-card text-foreground shadow-panel sm:h-auto sm:max-h-full sm:rounded-card',
          sizeClass[size],
        )}
      >
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <ModalFooter>{footer}</ModalFooter> : null}
      </div>
    </div>
  )
}

function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
      {children}
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
