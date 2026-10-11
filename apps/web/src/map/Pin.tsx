import { Calendar, House } from 'lucide-react'
import {
  categoryColor,
  kindColorsAttr,
  type Category,
  type KindMark,
} from '../components/category'
import { hoverClass } from '../components/ui/hover'
import { KindSymbolIcon } from '../kinds/symbols'
import { cn } from '../lib/utils'

export function Pin({
  category,
  kinds = [],
  label,
  selected = false,
  hover = false,
  filled = false,
  unread = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  testId,
}: {
  category: Category
  /** The spot's kinds in kind order; the first is the primary kind. */
  kinds?: readonly KindMark[]
  label: string
  selected?: boolean
  hover?: boolean
  filled?: boolean
  unread?: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  testId?: string
}) {
  const marks = category === 'kind' ? kinds.slice(0, 2) : []
  const [primary, second] = marks
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      data-testid={testId}
      data-kind-colors={marks.length > 0 ? kindColorsAttr(marks) : undefined}
      className={cn(
        hoverClass.pin,
        'relative inline-flex items-center justify-center rounded-full border-0 p-0 text-sm font-semibold text-white',
        selected
          ? 'is-selected size-9 shadow-panel ring-[3px] ring-white'
          : 'size-7',
        hover && 'is-hover scale-110',
      )}
      style={{
        backgroundColor: primary
          ? primary.color
          : categoryColor(category === 'kind' ? 'planned' : category),
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {second && primary ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex overflow-hidden rounded-full"
        >
          <span
            data-half="left"
            className="block w-1/2"
            style={{ backgroundColor: primary.color }}
          />
          <span
            data-half="right"
            className="block w-1/2"
            style={{ backgroundColor: second.color }}
          />
        </span>
      ) : null}
      <span className="relative inline-flex items-center justify-center">
        <PinIcon category={category} primary={primary} filled={filled} />
      </span>
      {unread ? (
        <span
          aria-hidden="true"
          data-testid="pin-unread"
          className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-background"
        />
      ) : null}
    </button>
  )
}

function PinIcon({
  category,
  primary,
  filled,
}: {
  category: Category
  primary: KindMark | undefined
  filled: boolean
}) {
  if (category === 'planned') {
    return (
      <Calendar aria-hidden="true" data-icon={category} className="size-3.5" />
    )
  }
  if (category === 'home') {
    return (
      <House
        aria-hidden="true"
        data-icon={filled ? 'home-filled' : category}
        fill={filled ? 'currentColor' : 'none'}
        className="size-3.5"
      />
    )
  }
  return primary ? <KindSymbolIcon symbol={primary.symbol} /> : null
}
