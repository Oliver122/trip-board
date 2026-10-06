import { useEffect, useState } from 'react'
import { NavLink, Outlet, useMatch } from 'react-router'
import { useTranslation } from 'react-i18next'
import { MembersDialog } from '../members/MembersDialog'
import { Header } from './Header'
import { activeLocale } from '../i18n'
import { cn } from '../lib/utils'
import { useSession } from '../session'

export function AppShell() {
  const { t, i18n } = useTranslation()
  const { user } = useSession()
  const schedule = useMatch('/trips/:id/schedule')
  const settings = useMatch('/trips/:id/settings')
  const board = useMatch('/trips/:id')
  const tripId = schedule?.params.id ?? settings?.params.id ?? board?.params.id
  const [membersOpen, setMembersOpen] = useState(false)

  useEffect(() => {
    setMembersOpen(false)
  }, [tripId])

  useEffect(() => {
    document.documentElement.lang = activeLocale(
      i18n.resolvedLanguage ?? i18n.language,
    )
  }, [i18n.language, i18n.resolvedLanguage])

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Header
        tripSwitcher={
          user ? (
            <span
              data-testid="trip-switcher"
              className="inline-flex min-h-11 items-center rounded-[8px] border border-border px-3 text-sm"
            >
              {t('header.tripSwitcher')}
            </span>
          ) : null
        }
        tabs={
          tripId ? (
            <nav aria-label={t('nav.label')} className="flex gap-1">
              <NavLink
                to={`/trips/${tripId}`}
                end
                className={({ isActive }) => tabClass(isActive)}
              >
                {t('nav.board')}
              </NavLink>
              <NavLink
                to={`/trips/${tripId}/schedule`}
                className={({ isActive }) => tabClass(isActive)}
              >
                {t('nav.schedule')}
              </NavLink>
              <NavLink
                to={`/trips/${tripId}/settings`}
                className={({ isActive }) => tabClass(isActive)}
              >
                {t('trips.settings')}
              </NavLink>
            </nav>
          ) : null
        }
        members={
          tripId ? (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-[8px] px-3 text-sm"
              onClick={() => setMembersOpen(true)}
            >
              {t('header.members')}
            </button>
          ) : user ? (
            <span className="inline-flex min-h-11 items-center px-1 text-sm">
              {t('header.members')}
            </span>
          ) : null
        }
      />
      {tripId && membersOpen ? (
        <MembersDialog tripId={tripId} onClose={() => setMembersOpen(false)} />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}

function tabClass(isActive: boolean) {
  return cn(
    'inline-flex min-h-11 items-center rounded-[8px] px-3',
    isActive ? 'bg-accent text-accent-foreground' : 'text-foreground',
  )
}
