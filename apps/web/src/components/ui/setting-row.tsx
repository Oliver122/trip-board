import { ChevronRight } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { hoverClass } from './hover'

export type SettingOption<T extends string> = { value: T; label: string }

/**
 * A setting as a row (R-42-28): label, current value and a chevron; it opens
 * its options as a radio list below the row. Used by the *More* sheet and the
 * account page for theme, language and low data.
 */
export function SettingRow<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  testId,
}: {
  label: string
  /** One line of explanation shown with the options. */
  hint?: string
  value: T
  options: SettingOption<T>[]
  onChange: (value: T) => void
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const current = options.find((option) => option.value === value)
  return (
    <div data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={cn(
          hoverClass.item,
          'flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm',
        )}
        onClick={() => setOpen((next) => !next)}
      >
        <span className="flex-1">{label}</span>
        <span className="text-muted">{current?.label}</span>
        <ChevronRight
          aria-hidden="true"
          className={cn('size-4 text-muted', open && 'rotate-90')}
        />
      </button>
      {open ? (
        <div id={panelId} className="px-4 pb-3">
          {hint ? <p className="mb-2 text-sm text-muted">{hint}</p> : null}
          <div
            role="radiogroup"
            aria-label={label}
            className="flex flex-wrap gap-2"
          >
            {options.map((option) => (
              <label
                key={option.value}
                className={cn(
                  hoverClass.secondary,
                  'inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-[8px] px-3 text-sm has-[:checked]:border-foreground',
                )}
              >
                <input
                  type="radio"
                  name={panelId}
                  value={option.value}
                  checked={option.value === value}
                  onChange={() => onChange(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** The same row with its control always shown (account page: language, theme). */
export function SettingControlRow({
  label,
  children,
  testId,
}: {
  label: string
  children: ReactNode
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1 text-sm"
    >
      <span>{label}</span>
      {children}
    </div>
  )
}
