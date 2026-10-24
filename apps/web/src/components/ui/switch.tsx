import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { hoverClass } from './hover'

/**
 * An on/off setting (R-42-16): a `role="switch"` button inside a label, so
 * the whole row toggles it. At least 44 px high.
 */
export function Switch({
  checked,
  onChange,
  children,
  disabled = false,
  testId,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  /** The visible label of the row. */
  children: ReactNode
  disabled?: boolean
  testId?: string
  className?: string
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 items-center justify-between gap-3',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className,
      )}
    >
      <span className="min-w-0">{children}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        onKeyDown={(event) => {
          // Toggle on keydown and cancel the button's own Space click on keyup.
          if (event.key !== ' ') return
          event.preventDefault()
          onChange(!checked)
        }}
        onKeyUp={(event) => {
          if (event.key === ' ') event.preventDefault()
        }}
        className={cn(
          // A 44 × 44 px target around the drawn track.
          'inline-flex size-11 shrink-0 items-center justify-center rounded-full',
          hoverClass.switch,
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'relative inline-flex h-6 w-10 items-center rounded-full border transition-colors',
            'group-hover:border-foreground group-disabled:group-hover:border-muted',
            checked ? 'border-accent bg-accent' : 'border-muted bg-hover',
          )}
        >
          <span
            className={cn(
              'inline-block size-4 rounded-full transition-transform',
              checked
                ? 'translate-x-5 bg-accent-foreground'
                : 'translate-x-1 bg-muted',
            )}
          />
        </span>
      </button>
    </label>
  )
}
