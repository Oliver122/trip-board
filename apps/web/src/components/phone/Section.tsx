import { ChevronDown, ChevronUp } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { hoverClass } from '../ui/hover'

/**
 * A collapsible panel section for the phone (R-38-04): a `button` with
 * `aria-expanded` above the content. Disabled, it renders the content as is.
 */
export function Section({
  enabled,
  title,
  open,
  onToggle,
  keepMounted = false,
  testId,
  children,
}: {
  enabled: boolean
  title: string
  open: boolean
  onToggle: () => void
  /** Keep the content in the page while collapsed (form fields). */
  keepMounted?: boolean
  testId?: string
  children: ReactNode
}) {
  const bodyId = useId()
  if (!enabled) return <>{children}</>
  return (
    <div className="border-t border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid={testId}
        className={cn(
          hoverClass.item,
          'flex min-h-12 w-full items-center justify-between gap-2 text-left font-semibold',
        )}
        onClick={onToggle}
      >
        {title}
        {open ? (
          <ChevronUp aria-hidden="true" className="size-4 shrink-0" />
        ) : (
          <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
        )}
      </button>
      <div id={bodyId} hidden={!open} className="space-y-3 pb-3">
        {open || keepMounted ? children : null}
      </div>
    </div>
  )
}
