import { Bell, ChevronRight, Settings, Users, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { cn } from '../../lib/utils'
import { useTheme, type ThemeChoice } from '../../theme'
import { DataSaverRow } from '../DataSaver'
import { hoverClass } from '../ui/hover'
import { SettingRow } from '../ui/setting-row'

const rowClass =
  'flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm'

const themeChoices: Array<[ThemeChoice, string]> = [
  ['light', 'header.themeLight'],
  ['dark', 'header.themeDark'],
  ['system', 'header.themeSystem'],
]

/**
 * The phone's *More* sheet (R-38-01, R-42-28): what the header no longer
 * holds. It ends above the bottom bar, which stays visible and usable, so it
 * is a dialog without a backdrop.
 */
export function MoreSheet({
  tripId,
  unread,
  canSeeMembers,
  onMembers,
  onNews,
  onClose,
}: {
  tripId: string
  unread: number
  canSeeMembers: boolean
  onMembers: () => void
  onNews: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      data-testid="more-sheet"
      className="fixed inset-x-0 top-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col bg-card text-foreground"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border py-3 pr-2 pl-4">
        <h2 id={titleId} className="text-lg font-semibold">
          {t('phone.moreTitle')}
        </h2>
        <button
          ref={closeRef}
          type="button"
          className={cn(
            hoverClass.ghost,
            'inline-flex size-11 items-center justify-center rounded-[8px]',
          )}
          aria-label={t('ui.close')}
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        <li>
          <Link
            to={`/trips/${tripId}/settings`}
            className={cn(hoverClass.item, rowClass)}
            onClick={onClose}
          >
            <Settings aria-hidden="true" className="size-4" />
            <span className="flex-1">{t('phone.settings')}</span>
            <Chevron />
          </Link>
        </li>
        {canSeeMembers ? (
          <li>
            <button
              type="button"
              className={cn(hoverClass.item, rowClass)}
              onClick={onMembers}
            >
              <Users aria-hidden="true" className="size-4" />
              <span className="flex-1">{t('phone.members')}</span>
              <Chevron />
            </button>
          </li>
        ) : null}
        <li>
          <button
            type="button"
            className={cn(hoverClass.item, rowClass)}
            data-testid="more-news"
            aria-label={
              unread > 0 ? t('news.buttonUnread', { count: unread }) : undefined
            }
            onClick={onNews}
          >
            <Bell aria-hidden="true" className="size-4" />
            <span className="flex-1">{t('phone.news')}</span>
            {unread > 0 ? (
              <span
                aria-hidden="true"
                data-testid="news-badge"
                className="inline-flex min-w-5 justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground"
              >
                {unread > 99 ? t('news.overflow') : unread}
              </span>
            ) : null}
            <Chevron />
          </button>
        </li>
        <li>
          <SettingRow<ThemeChoice>
            testId="theme-row"
            label={t('header.theme')}
            value={theme}
            options={themeChoices.map(([value, key]) => ({
              value,
              label: t(key),
            }))}
            onChange={setTheme}
          />
        </li>
        <li>
          <DataSaverRow />
        </li>
      </ul>
    </div>
  )
}

function Chevron() {
  return <ChevronRight aria-hidden="true" className="size-4 text-muted" />
}
