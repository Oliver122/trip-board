import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * The shared empty-and-error block (R-42-24): heading, one line of what to do
 * and one primary action. On the page column with the 16 px edge below
 * 640 px, centred in a column of at most 480 px above.
 */
export function EmptyState({
  title,
  body,
  action,
  testId,
  className,
}: {
  title: string
  body: string
  /** The primary button or link (at least 44 px high). */
  action: ReactNode
  testId?: string
  className?: string
}) {
  return (
    <section
      data-testid={testId}
      className={cn('mx-auto w-full max-w-[480px] px-4 py-8', className)}
    >
      <h1 className="mb-2 text-xl font-semibold">{title}</h1>
      <p className="mb-6 text-muted">{body}</p>
      <div className="flex flex-col sm:flex-row">{action}</div>
    </section>
  )
}
