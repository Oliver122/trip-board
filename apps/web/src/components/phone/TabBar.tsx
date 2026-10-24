import { Calendar, Ellipsis, List, Map as MapIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { cn } from '../../lib/utils'
import { hoverClass } from '../ui/hover'
import type { PhoneView } from './use-phone'

export type PhoneTab = 'map' | 'list' | 'schedule' | 'more'

const tabClass = (active: boolean) =>
  cn(
    'flex min-h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 text-xs',
    active ? 'font-semibold text-accent' : 'text-muted',
  )

function Tab({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: 'true' }>
  label: string
}) {
  return (
    <>
      <Icon aria-hidden="true" className="size-5" />
      <span>{label}</span>
    </>
  )
}

/** Bottom bar of the phone layout (R-38-01). */
export function TabBar({
  tripId,
  active,
  onView,
  onMore,
  onNavigate,
}: {
  tripId: string
  active: PhoneTab
  onView: (view: PhoneView) => void
  onMore: () => void
  /** Called when a tab that leaves the page is followed (closes the More sheet). */
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('phone.tabsLabel')}
      data-testid="tab-bar"
      className="flex shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <Link
        to={`/trips/${tripId}`}
        aria-current={active === 'map' ? 'page' : undefined}
        className={cn(hoverClass.tab, tabClass(active === 'map'))}
        onClick={(event) => {
          event.preventDefault()
          onView('map')
        }}
      >
        <Tab icon={MapIcon} label={t('phone.map')} />
      </Link>
      <Link
        to={`/trips/${tripId}?view=list`}
        aria-current={active === 'list' ? 'page' : undefined}
        className={cn(hoverClass.tab, tabClass(active === 'list'))}
        onClick={(event) => {
          event.preventDefault()
          onView('list')
        }}
      >
        <Tab icon={List} label={t('phone.list')} />
      </Link>
      <Link
        to={`/trips/${tripId}/schedule`}
        aria-current={active === 'schedule' ? 'page' : undefined}
        className={cn(hoverClass.tab, tabClass(active === 'schedule'))}
        onClick={onNavigate}
      >
        <Tab icon={Calendar} label={t('phone.schedule')} />
      </Link>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-current={active === 'more' ? 'page' : undefined}
        className={cn(hoverClass.tab, tabClass(active === 'more'))}
        onClick={onMore}
      >
        <Tab icon={Ellipsis} label={t('phone.more')} />
      </button>
    </nav>
  )
}
