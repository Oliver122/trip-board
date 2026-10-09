import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { request } from '../api/http'
import { cn } from '../lib/utils'
import { DevLoginBadge } from '../dev-login'
import { useSession } from '../session'
import { ThemeSwitch } from './Preferences'
import { hoverClass } from './ui/hover'
import { Menu, MenuItem, MenuLink } from './ui/menu'

export function Header({
  tabs,
  news,
  members,
}: {
  tabs?: ReactNode
  news?: ReactNode
  members?: ReactNode
}) {
  const { t } = useTranslation()
  const { user } = useSession()

  return (
    <header className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2 md:px-8">
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
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {news}
        <div data-slot="members">{members}</div>
        <DevLoginBadge />
        <ThemeSwitch />
        {user ? <AvatarMenu /> : null}
      </div>
    </header>
  )
}

function AvatarMenu() {
  const { t } = useTranslation()
  const { user } = useSession()

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
          {user.avatarUrl ? (
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
          <span data-testid="username">{user.username}</span>
        </>
      }
    >
      <MenuLink to="/account">{t('account.title')}</MenuLink>
      {user.appRole === 'admin' ? (
        <MenuLink to="/admin">{t('header.admin')}</MenuLink>
      ) : null}
      <MenuItem onSelect={() => void logout()}>{t('header.logout')}</MenuItem>
    </Menu>
  )
}
