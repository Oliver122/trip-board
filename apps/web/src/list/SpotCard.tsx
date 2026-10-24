import type { Spot } from '@tripboard/shared'
import { Calendar, House, MapPin, MessageSquare } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import {
  categoryColor,
  CategoryStrip,
  kindNamesText,
  type Category,
} from '../components/category'
import { hoverClass } from '../components/ui/hover'
import { KindSymbolIcon } from '../kinds/symbols'
import { formatDate, formatTime } from '../lib/format'
import type { AppLocale } from '../lib/locale'
import { cn } from '../lib/utils'
import { googleMapsUrl } from '../spots/maps-link'

/**
 * The first visit as the schedule shows it (R-42-13): a date, plus the time
 * only when one was planned. `spots_view` stores the trip's local wall clock;
 * midnight stands for "no time".
 */
export function visitText(value: string, locale: AppLocale): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) return value
  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
    ),
  )
  if (match[4] === '00' && match[5] === '00') return formatDate(date, locale)
  return `${formatDate(date, locale)} ${formatTime(date, locale)}`
}

/** "Planned · 14 Apr 2026": the kind's name in words, then the date or address (R-42-14). */
export function cardSubtitle(
  t: TFunction,
  spot: Spot,
  locale: AppLocale,
): string {
  const category = spot.displayCategory
  const name =
    category === 'kind'
      ? kindNamesText(t, spot.kinds)
      : t(`category.${category}`)
  const detail = spot.firstScheduledAt
    ? visitText(spot.firstScheduledAt, locale)
    : (spot.address ?? '')
  return [name, detail].filter(Boolean).join(' · ')
}

export function SpotCard({
  spot,
  locale,
  phone,
  selected,
  onSelect,
  onHover,
}: {
  spot: Spot
  locale: AppLocale
  phone: boolean
  selected: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const { t } = useTranslation()
  const category = spot.displayCategory
  return (
    <li className="relative">
      <button
        type="button"
        id={`spot-card-${spot.id}`}
        data-testid={`card-${spot.id}`}
        className={cn(
          hoverClass.card,
          'flex w-full items-stretch gap-3 border-b border-border text-left',
          selected && 'bg-background',
        )}
        onClick={() => onSelect(spot.id)}
        onMouseEnter={() => onHover(spot.id)}
        onMouseLeave={() => onHover(null)}
      >
        <CategoryStrip category={category} kinds={spot.kinds} />
        <span className="min-w-0 flex-1 py-3">
          <span className="block font-semibold">{spot.title}</span>
          <span className="block text-muted">
            {cardSubtitle(t, spot, locale)}
          </span>
        </span>
        <CommentMark count={spot.commentCount} unread={spot.unreadComments} />
        <CategoryMark
          category={category}
          kinds={spot.kinds}
          filled={spot.primary}
        />
        {phone ? <span className="w-12 shrink-0" aria-hidden="true" /> : null}
      </button>
      {phone ? (
        <a
          href={googleMapsUrl(spot)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`card-maps-${spot.id}`}
          aria-label={t('phone.openSpotInMaps', { title: spot.title })}
          className={cn(
            hoverClass.ghost,
            'absolute right-0 top-1/2 inline-flex size-12 -translate-y-1/2 items-center justify-center',
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <MapPin aria-hidden="true" className="size-5" />
        </a>
      ) : null}
    </li>
  )
}

function CommentMark({ count, unread }: { count: number; unread: number }) {
  const { t } = useTranslation()
  if (count === 0) return null
  const label =
    unread > 0
      ? `${t('comments.count', { count })}, ${t('news.newCount', { count: unread })}`
      : t('comments.count', { count })
  return (
    <span
      role="img"
      aria-label={label}
      data-testid="comment-count"
      className={cn(
        'inline-flex items-center gap-1 self-center pr-2 text-sm',
        unread > 0 ? 'font-semibold text-accent' : 'text-muted',
      )}
    >
      <MessageSquare
        aria-hidden="true"
        className="size-4"
        fill={unread > 0 ? 'currentColor' : 'none'}
      />
      <span aria-hidden="true">{unread > 0 ? unread : count}</span>
    </span>
  )
}

/** One 16 px outline icon style for kinds, planned and home. */
function CategoryMark({
  category,
  kinds,
  filled,
}: {
  category: Category
  kinds: Spot['kinds']
  filled: boolean
}) {
  return (
    <span
      className="inline-flex items-center gap-1 pr-3 text-sm"
      style={
        category === 'kind' ? undefined : { color: categoryColor(category) }
      }
    >
      {category === 'planned' ? (
        <Calendar aria-hidden="true" data-icon={category} className="size-4" />
      ) : null}
      {category === 'home' ? (
        <House
          aria-hidden="true"
          data-icon={filled ? 'home-filled' : category}
          fill={filled ? 'currentColor' : 'none'}
          className="size-4"
        />
      ) : null}
      {category === 'kind'
        ? kinds.map((kind) => (
            <span key={kind.id} style={{ color: kind.color }}>
              <KindSymbolIcon symbol={kind.symbol} className="size-4" />
            </span>
          ))
        : null}
    </span>
  )
}
