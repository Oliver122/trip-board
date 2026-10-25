import { Calendar, House } from 'lucide-react'
import {
  categoryColor,
  kindColorsAttr,
  type Category,
  type KindMark,
} from '../components/category'
import { hoverClass } from '../components/ui/hover'
import { SymbolMark, useSymbolTexture } from '../kinds/textures'
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
  // Hooks run for every pin; planned and home pins have no primary symbol.
  const textured =
    useSymbolTexture(primary?.symbol ?? 'dot') !== null && !!primary
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      data-testid={testId}
      data-kind-colors={marks.length > 0 ? kindColorsAttr(marks) : undefined}
      className={cn(
        hoverClass.pin,
        // Below 640 px the button is a 44 px hit area around the drawing.
        'relative inline-flex items-center justify-center border-0 bg-transparent p-0 max-sm:size-11',
        selected && 'is-selected',
        hover && 'is-hover',
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span
        data-pin-drawing
        className={cn(
          'relative inline-flex items-center justify-center rounded-full text-sm font-semibold text-white',
          selected ? 'size-9 shadow-panel ring-[3px] ring-white' : 'size-7',
          hover && 'scale-110',
        )}
        style={{
          backgroundColor: primary
            ? primary.color
            : categoryColor(category === 'kind' ? 'planned' : category),
        }}
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
        {textured && primary ? (
          <SymbolMark
            symbol={primary.symbol}
            ringColor={primary.color}
            className={cn('absolute', second ? 'inset-1' : 'inset-0')}
          />
        ) : (
          <span className="relative inline-flex items-center justify-center">
            <PinIcon category={category} primary={primary} filled={filled} />
          </span>
        )}
        {unread ? (
          <span
            aria-hidden="true"
            data-testid="pin-unread"
            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-background"
          />
        ) : null}
      </span>
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
  return primary ? <SymbolMark symbol={primary.symbol} /> : null
}
