import { Calendar, House } from 'lucide-react'
import type { Category } from '../components/category'
import { cn } from '../lib/utils'

const glyph: Record<Category, string> = {
  'must-go': '!',
  maybe: '?',
  planned: '',
  home: '',
}

export function Pin({
  category,
  label,
  selected = false,
  hover = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  testId,
}: {
  category: Category
  label: string
  selected?: boolean
  hover?: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      data-testid={testId}
      className={cn(
        'inline-flex items-center justify-center rounded-full border-0 p-0 text-sm font-semibold text-white',
        selected
          ? 'is-selected size-9 shadow-panel ring-[3px] ring-white'
          : 'size-7',
        hover && 'is-hover scale-110',
      )}
      style={{ backgroundColor: `var(--cat-${category})` }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <PinIcon category={category} />
    </button>
  )
}

function PinIcon({ category }: { category: Category }) {
  if (category === 'planned') {
    return (
      <Calendar aria-hidden="true" data-icon={category} className="size-3.5" />
    )
  }
  if (category === 'home') {
    return (
      <House aria-hidden="true" data-icon={category} className="size-3.5" />
    )
  }
  return (
    <span aria-hidden="true" data-icon={category}>
      {glyph[category]}
    </span>
  )
}
