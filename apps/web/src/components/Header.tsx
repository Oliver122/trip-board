import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'
import { DevLoginBadge } from '../dev-login'
import { useSession } from '../session'
import { ThemeSwitch } from './Preferences'
import { hoverClass } from './ui/hover'

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
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  if (!user) return null

  async function logout() {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    if (response.ok) window.location.assign('/login')
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('header.account')}
        className={cn(
          hoverClass.ghost,
          'inline-flex min-h-11 items-center gap-2 rounded-full px-1',
        )}
        onClick={() => setOpen((value) => !value)}
      >
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
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 min-w-40 rounded-[8px] border border-border bg-card p-1 shadow-panel"
        >
          <Link
            to="/account"
            role="menuitem"
            className={cn(
              hoverClass.item,
              'flex min-h-11 items-center rounded-[8px] px-3',
            )}
            onClick={() => setOpen(false)}
          >
            {t('account.title')}
          </Link>
          {user.appRole === 'admin' ? (
            <Link
              to="/admin"
              role="menuitem"
              className={cn(
                hoverClass.item,
                'flex min-h-11 items-center rounded-[8px] px-3',
              )}
              onClick={() => setOpen(false)}
            >
              {t('header.admin')}
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={cn(
              hoverClass.item,
              'flex min-h-11 w-full items-center rounded-[8px] px-3 text-left',
            )}
            onClick={() => {
              void logout()
            }}
          >
            {t('header.logout')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
