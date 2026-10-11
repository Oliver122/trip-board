import { Check } from 'lucide-react'
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { hoverClass } from './hover'

export type ChipOption = {
  value: string
  label: string
  /** A color dot or symbol shown before the label. */
  mark?: ReactNode
  count?: number
  disabled?: boolean
}

/** More options than this show a search field. */
export const chipSearchThreshold = 8

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
}

/**
 * A wrap of toggle chips (`aria-pressed`). With `max`, chips that are not
 * pressed are disabled once `value` holds that many, and `maxHint` is shown.
 * One chip is in the tab order; arrow keys move between chips.
 */
export function ChipGroup({
  options,
  value,
  onChange,
  label,
  searchLabel,
  max,
  maxHint,
  disabled = false,
  testId,
  className,
}: {
  options: readonly ChipOption[]
  value: readonly string[]
  onChange: (value: string[]) => void
  /** Accessible name of the group. */
  label: string
  searchLabel?: string
  max?: number
  maxHint?: string
  disabled?: boolean
  testId?: string
  className?: string
}) {
  const { t } = useTranslation()
  const hintId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const searchable = options.length > chipSearchThreshold
  const needle = searchable ? fold(search.trim()) : ''
  const shown =
    needle === ''
      ? options
      : options.filter((option) => fold(option.label).includes(needle))
  const atMax = max != null && value.length >= max
  const isOff = (option: ChipOption) =>
    disabled ||
    option.disabled === true ||
    (atMax && !value.includes(option.value))
  // Roving tabindex: the first pressed chip, else the first usable one.
  const stop =
    shown.find((option) => value.includes(option.value) && !isOff(option)) ??
    shown.find((option) => !isOff(option))

  function toggle(option: ChipOption) {
    if (isOff(option)) return
    onChange(
      value.includes(option.value)
        ? value.filter((item) => item !== option.value)
        : [...value, option.value],
    )
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const keys = [
      'ArrowRight',
      'ArrowDown',
      'ArrowLeft',
      'ArrowUp',
      'Home',
      'End',
    ]
    if (!keys.includes(event.key)) return
    const chips = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[aria-pressed]:not(:disabled)',
      ) ?? [],
    )
    if (chips.length === 0) return
    event.preventDefault()
    const at = chips.indexOf(event.currentTarget)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? chips.length - 1
          : event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? (at + 1) % chips.length
            : (at - 1 + chips.length) % chips.length
    chips[next]?.focus()
  }

  return (
    <div className={className} data-testid={testId}>
      {searchable ? (
        <input
          type="search"
          aria-label={searchLabel ?? t('ui.chips.search')}
          placeholder={searchLabel ?? t('ui.chips.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="mb-2 w-full min-h-11 rounded-[8px] border border-border bg-card px-3 text-foreground"
        />
      ) : null}
      <div
        ref={listRef}
        role="group"
        aria-label={label}
        aria-describedby={atMax ? hintId : undefined}
        className="flex flex-wrap gap-2"
      >
        {shown.map((option) => {
          const pressed = value.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              disabled={isOff(option)}
              tabIndex={option === stop ? 0 : -1}
              data-testid={`chip-${option.value}`}
              onClick={() => toggle(option)}
              onKeyDown={onKeyDown}
              className={cn(
                hoverClass.secondary,
                'inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-60',
                pressed && 'border-foreground bg-hover font-semibold',
              )}
            >
              {option.mark}
              <span>{option.label}</span>
              {option.count != null ? (
                <span className="text-muted">{option.count}</span>
              ) : null}
              {pressed ? <Check aria-hidden="true" className="size-3" /> : null}
            </button>
          )
        })}
      </div>
      {shown.length === 0 ? (
        <p role="status" className="text-sm text-muted">
          {t('ui.chips.noMatch')}
        </p>
      ) : null}
      {atMax ? (
        <p id={hintId} className="mt-1 text-sm text-muted">
          {maxHint ?? t('ui.chips.max', { max })}
        </p>
      ) : null}
    </div>
  )
}
