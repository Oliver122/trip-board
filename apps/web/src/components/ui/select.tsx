import { ChevronDown } from 'lucide-react'
import { useId, type SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'
import { hoverClass } from './hover'

export function Select({
  label,
  hideLabel,
  wrapperClassName,
  className,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  hideLabel?: boolean
  wrapperClassName?: string
}) {
  const generated = useId()
  const selectId = id ?? generated
  return (
    <div className={cn('flex flex-col gap-1', wrapperClassName)}>
      <label
        htmlFor={selectId}
        className={cn(hideLabel ? 'sr-only' : 'text-sm font-medium')}
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            hoverClass.secondary,
            'min-h-11 w-full appearance-none rounded-[8px] py-2 pl-3 pr-9 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-60',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
      </div>
    </div>
  )
}
