import { CircleAlert } from 'lucide-react'
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '../lib/utils'

type FieldProps = {
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-describedby'?: string
  className?: string
}

export function FieldError({
  message,
  children,
  id,
  testId,
}: {
  message?: string | null
  children: ReactElement<FieldProps>
  id?: string
  testId?: string
}) {
  const generated = useId()
  if (!message) return children
  const errorId = id ?? generated
  const describedBy = [children.props['aria-describedby'], errorId]
    .filter(Boolean)
    .join(' ')
  return (
    <>
      {cloneElement(children, {
        'aria-invalid': true,
        'aria-describedby': describedBy,
        className: cn(children.props.className, 'border-danger'),
      })}
      <p
        id={errorId}
        role="alert"
        data-testid={testId}
        className="mt-1 flex items-start gap-1.5 text-sm text-danger"
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{message}</span>
      </p>
    </>
  )
}

export function ErrorNotice({
  children,
  className,
  testId,
}: {
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className={cn(
        'flex items-start gap-2 rounded-[8px] border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger',
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
