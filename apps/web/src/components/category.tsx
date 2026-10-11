import type { SpotKindRef } from '@tripboard/shared'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { KindSymbolIcon } from '../kinds/symbols'
import { kindLabel } from '../kinds/label'
import { cn } from '../lib/utils'

/** `kind` is a spot with 1 or 2 kinds; `planned` and `home` are system states. */
export const categories = ['kind', 'planned', 'home'] as const

export type Category = (typeof categories)[number]
export type SystemCategory = Exclude<Category, 'kind'>

/** What a pin, strip or dot needs of a kind. */
export type KindMark = Pick<SpotKindRef, 'color' | 'symbol'>

export function categoryColor(category: SystemCategory) {
  return `var(--cat-${category})`
}

/** Stable test hook: the colors of a mark in kind order. */
export function kindColorsAttr(kinds: readonly KindMark[]): string {
  return kinds.map((kind) => kind.color).join(',')
}

/** One name, or "First and Second", for badges and accessible names. */
export function kindNamesText(
  t: TFunction,
  kinds: readonly Pick<SpotKindRef, 'name' | 'preset'>[],
): string {
  const [first, second] = kinds
  if (!first) return ''
  if (!second) return kindLabel(t, first)
  return t('kinds.both', {
    first: kindLabel(t, first),
    second: kindLabel(t, second),
  })
}

export function CategoryDot({
  category,
  kind,
}: {
  category?: SystemCategory
  kind?: KindMark
}) {
  if (kind) {
    return (
      <span
        data-testid="category-dot"
        data-kind-colors={kind.color}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none text-white"
        style={{ backgroundColor: kind.color }}
        aria-hidden="true"
      >
        <KindSymbolIcon symbol={kind.symbol} className="size-2.5" />
      </span>
    )
  }
  return (
    <span
      data-testid="category-dot"
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: categoryColor(category ?? 'planned') }}
      aria-hidden="true"
    />
  )
}

export function CategoryBadge({
  category,
  kinds = [],
}: {
  category: Category
  kinds?: readonly Pick<SpotKindRef, 'name' | 'preset' | 'color' | 'symbol'>[]
}) {
  const { t } = useTranslation()
  return (
    <span
      data-testid="category-badge"
      className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-border px-2 py-1"
    >
      {category === 'kind' ? (
        kinds.map((kind) => (
          <span
            key={kind.color + kindLabel(t, kind)}
            data-testid="category-badge-kind"
            className="inline-flex items-center gap-1.5"
          >
            <CategoryDot kind={kind} />
            {kindLabel(t, kind)}
          </span>
        ))
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <CategoryDot category={category} />
          {t(`category.${category}`)}
        </span>
      )}
    </span>
  )
}

/** The list's 3 px strip: one color, or primary on top and second below. */
export function CategoryStrip({
  category,
  kinds = [],
}: {
  category: Category
  kinds?: readonly KindMark[]
}) {
  if (category !== 'kind' || kinds.length < 2) {
    const [only] = kinds
    return (
      <span
        data-testid="category-strip"
        data-kind-colors={only?.color}
        className="block w-[3px] self-stretch"
        style={{
          backgroundColor:
            category === 'kind'
              ? (only?.color ?? categoryColor('planned'))
              : categoryColor(category),
        }}
        aria-hidden="true"
      />
    )
  }
  return (
    <span
      data-testid="category-strip"
      data-kind-colors={kindColorsAttr(kinds)}
      className={cn('flex w-[3px] flex-col self-stretch')}
      aria-hidden="true"
    >
      {kinds.slice(0, 2).map((kind, index) => (
        <span
          key={index}
          data-half={index === 0 ? 'top' : 'bottom'}
          className="block flex-1"
          style={{ backgroundColor: kind.color }}
        />
      ))}
    </span>
  )
}

/** CSS background for a vertical bar: one color, or primary on top and second below. */
export function kindsBarBackground(kinds: readonly KindMark[]): string {
  const [first, second] = kinds
  if (!first) return categoryColor('planned')
  if (!second) return first.color
  return `linear-gradient(to bottom, ${first.color} 50%, ${second.color} 50%)`
}
