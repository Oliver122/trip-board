import { useTranslation } from 'react-i18next'

export const categories = ['must-go', 'maybe', 'planned', 'home'] as const

export type Category = (typeof categories)[number]

function categoryColor(category: Category) {
  return `var(--cat-${category})`
}

export function CategoryDot({ category }: { category: Category }) {
  return (
    <span
      data-testid="category-dot"
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: categoryColor(category) }}
      aria-hidden="true"
    />
  )
}

export function CategoryBadge({ category }: { category: Category }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1">
      <CategoryDot category={category} />
      {t(`category.${category}`)}
    </span>
  )
}

export function CategoryStrip({ category }: { category: Category }) {
  return (
    <span
      data-testid="category-strip"
      className="block w-[3px] self-stretch"
      style={{ backgroundColor: categoryColor(category) }}
      aria-hidden="true"
    />
  )
}
