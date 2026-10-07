import { Fragment } from 'react'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'

const linkPattern = /(https?:\/\/[^\s<>"']+)/gi
const trailingPunctuation = /[.,;:!?)\]]+$/

/**
 * Comment text as plain text: line breaks are kept, `http(s)` URLs become
 * links, and anything else (HTML included) is shown as typed.
 */
export function CommentBody({
  body,
  className,
}: {
  body: string
  className?: string
}) {
  const parts = body.split(linkPattern)
  return (
    <p className={cn('whitespace-pre-wrap break-words', className)}>
      {parts.map((part, index) => {
        if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>
        const trailing = trailingPunctuation.exec(part)?.[0] ?? ''
        const href = trailing ? part.slice(0, -trailing.length) : part
        return (
          <Fragment key={index}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={cn(hoverClass.link, 'underline underline-offset-2')}
            >
              {href}
            </a>
            {trailing}
          </Fragment>
        )
      })}
    </p>
  )
}
