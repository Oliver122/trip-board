import { Bell, Settings, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { cn } from '../../lib/utils'
import { DataSaverSwitch } from '../DataSaver'
import { ThemeSwitch } from '../Preferences'
import { hoverClass } from '../ui/hover'
import { Modal } from '../ui/modal'

const rowClass =
  'flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm'

/** The phone's *More* sheet (R-38-01): what the header no longer holds. */
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
  return (
    <Modal
      title={t('phone.moreTitle')}
      closeLabel={t('ui.close')}
      onClose={onClose}
      testId="more-sheet"
    >
      <ul className="m-0 list-none p-0">
        <li>
          <Link
            to={`/trips/${tripId}/settings`}
            className={cn(hoverClass.item, rowClass)}
            onClick={onClose}
          >
            <Settings aria-hidden="true" className="size-4" />
            {t('phone.settings')}
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
              {t('phone.members')}
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
          </button>
        </li>
        <li>
          <DataSaverSwitch />
        </li>
        <li className="flex px-3 py-2">
          <ThemeSwitch />
        </li>
      </ul>
    </Modal>
  )
}
