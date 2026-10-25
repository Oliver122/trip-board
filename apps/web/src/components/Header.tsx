import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Check, ChevronLeft, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { request } from '../api/http'
import { cn } from '../lib/utils'
import { DevLoginBadge } from '../dev-login'
import { useDataSaver } from '../lib/data-saver'
import { useMediaQuery } from '../lib/media'
import { useSession } from '../session'
import { useTheme, type ThemeChoice } from '../theme'
import { DataSaverBadge, DataSaverMenuItem } from './DataSaver'
import { ThemeSwitch } from './Preferences'
import { hoverClass } from './ui/hover'
import { Menu, MenuItem, MenuLink } from './ui/menu'

const themeChoices: Array<[ThemeChoice, string]> = [
  ['light', 'header.themeLight'],
  ['dark', 'header.themeDark'],
  ['system', 'header.themeSystem'],
]

export function Header({
  tabs,
  news,
  members,
  phone,
}: {
  tabs?: ReactNode
  news?: ReactNode
  members?: ReactNode
  /** Below 640 px: one 48 px row with back link, trip name and avatar menu (R-38-03). */
  phone?: { tripName: string | null } | null
}) {
  const { t } = useTranslation()
  const { user } = useSession()

  if (phone) {
    return (
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-2">
        <Link
          to="/trips"
          aria-label={t('phone.back')}
          className={cn(
            hoverClass.link,
            'inline-flex size-11 shrink-0 items-center justify-center',
          )}
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Link>
        <span
          data-testid="trip-name"
          title={phone.tripName ?? undefined}
          className="min-w-0 flex-1 truncate font-semibold"
        >
          {phone.tripName}
        </span>
        <DataSaverBadge />
        {user ? <AvatarMenu /> : null}
      </header>
    )
  }

  return (
    <header className="flex min-h-14 items-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2 max-lg:h-14 max-lg:py-0 md:px-8 lg:flex-wrap">
      <Link
        to="/trips"
        className={cn(
          hoverClass.link,
          'inline-flex min-h-11 items-center gap-2 font-semibold',
        )}
      >
        <MapPin aria-hidden="true" className="size-4" />
        {t('appName')}
      </Link>
      <div data-slot="tabs">{tabs}</div>
      <div className="ml-auto flex items-center gap-2 lg:flex-wrap">
        {news}
        <div data-slot="members">{members}</div>
        <DevLoginBadge />
        <DataSaverBadge />
        <div className="max-lg:hidden">
          <ThemeSwitch />
        </div>
        {user ? <AvatarMenu /> : null}
      </div>
    </header>
  )
}

function AvatarMenu() {
  const { t } = useTranslation()
  const { user } = useSession()
  const { on: lowData } = useDataSaver()
  const { theme, setTheme } = useTheme()
  // The header's own theme switch takes over from 1024 px (R-42-10).
  const narrow = useMediaQuery('(max-width: 1023.98px)')

  if (!user) return null

  async function logout() {
    try {
      await request('/api/auth/logout', { method: 'POST' })
      window.location.assign('/login')
    } catch {
      /* stay signed in */
    }
  }

  return (
    <Menu
      label={t('header.account')}
      triggerClassName="rounded-full px-1"
      trigger={
        <>
          {user.avatarUrl && !lowData ? (
            <img
              src={user.avatarUrl}
              alt=""
              width={28}
              height={28}
              className="size-7 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex size-7 items-center justify-center rounded-full bg-border text-sm"
            >
              {user.username.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span data-testid="username" className="max-lg:sr-only">
            {user.username}
          </span>
        </>
      }
    >
      <MenuLink to="/account">{t('account.title')}</MenuLink>
      <DataSaverMenuItem />
      {narrow ? (
        <div role="group" aria-label={t('header.theme')}>
          <p className="px-3 pt-1 text-xs text-muted">{t('header.theme')}</p>
          {themeChoices.map(([choice, key]) => (
            <MenuItem
              key={choice}
              testId={`menu-theme-${choice}`}
              onSelect={() => setTheme(choice)}
            >
              <span className="flex-1">{t(key)}</span>
              {theme === choice ? (
                <Check aria-hidden="true" className="size-4" />
              ) : null}
            </MenuItem>
          ))}
        </div>
      ) : null}
      {user.appRole === 'admin' ? (
        <MenuLink to="/admin">{t('header.admin')}</MenuLink>
      ) : null}
      <MenuItem onSelect={() => void logout()}>{t('header.logout')}</MenuItem>
    </Menu>
  )
}
