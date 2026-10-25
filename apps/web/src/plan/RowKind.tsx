import type { Spot } from '@tripboard/shared'
import { Calendar, House } from 'lucide-react'
import { categoryColor, CategoryStrip } from '../components/category'
import { KindSymbolIcon } from '../kinds/symbols'

/** The kind's colour strip, as a list card draws it (R-42-22). */
export function RowStrip({ spot }: { spot: Spot | undefined }) {
  if (!spot) return <span className="w-[3px] self-stretch" aria-hidden="true" />
  return <CategoryStrip category={spot.displayCategory} kinds={spot.kinds} />
}

/** The kind's symbol, as a list card draws it (R-42-22). */
export function RowSymbol({ spot }: { spot: Spot | undefined }) {
  if (!spot) return null
  const category = spot.displayCategory
  return (
    <span
      data-testid="row-symbol"
      className="inline-flex shrink-0 items-center gap-1"
      style={
        category === 'kind' ? undefined : { color: categoryColor(category) }
      }
    >
      {category === 'planned' ? (
        <Calendar aria-hidden="true" className="size-4" />
      ) : null}
      {category === 'home' ? (
        <House aria-hidden="true" className="size-4" />
      ) : null}
      {category === 'kind'
        ? spot.kinds.map((kind) => (
            <span key={kind.id} style={{ color: kind.color }}>
              <KindSymbolIcon symbol={kind.symbol} className="size-4" />
            </span>
          ))
        : null}
    </span>
  )
}
