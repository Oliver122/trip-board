import { createContext, useContext, useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ThemeSwitch } from '../components/Preferences'
import { Header } from '../components/Header'
import { buttonVariants } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { DevLoginBadge } from '../dev-login'
import { hoverClass } from '../components/ui/hover'
import { NotFoundPage } from '../pages/NotFoundPage'
import { phoneQuery, useMediaQuery } from '../lib/media'
import { cn } from '../lib/utils'
import { useSession } from '../session'
import { getStats, pendingRequestCount } from './client'

const nav = [
  ['/admin', 'dashboard', true],
  ['/admin/users', 'users', false],
  ['/admin/trips', 'trips', false],
  ['/admin/activity', 'activity', false],
  ['/admin/storage', 'storage', false],
  ['/admin/requests', 'requests', false],
  ['/admin/settings', 'settings', false],
  ['/admin/audit', 'audit', false],
] as const

type PendingValue = {
  count: number
  refresh: () => void
}

const PendingContext = createContext<PendingValue>({
  count: 0,
  refresh: () => {},
})

export function usePendingRequests() {
  return useContext(PendingContext)
}

const CapacityContext = createContext({ refresh: () => {} })

export function useCapacityRefresh() {
  return useContext(CapacityContext).refresh
}

export function AdminGate() {
  const { user } = useSession()
  if (!user || user.appRole !== 'admin') return <NotFoundPage />
  return <AdminLayout />
}

function AdminLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const phone = useMediaQuery(phoneQuery)
  const [count, setCount] = useState(0)
  const [tick, setTick] = useState(0)
  const [capacityTick, setCapacityTick] = useState(0)
  const [warning, setWarning] = useState<'db' | 'blob' | null>(null)
  const [level, setLevel] = useState<'amber' | 'red' | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void pendingRequestCount(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setCount(next)
      })
      .catch(() => {
        if (!controller.signal.aborted) setCount(0)
      })
    return () => controller.abort()
  }, [tick])

  useEffect(() => {
    const controller = new AbortController()
    void getStats('30d', controller.signal)
      .then((stats) => {
        if (controller.signal.aborted) return
        setWarning(stats.warning)
        setLevel(stats.level)
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setWarning(null)
          setLevel(null)
        }
      })
    return () => controller.abort()
  }, [location.pathname, capacityTick])

  if (phone) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <Header />
        <main className="min-h-0 flex-1 overflow-auto">
          <EmptyState
            testId="admin-phone-notice"
            title={t('admin.phoneTitle')}
            body={t('phone.adminNotice')}
            action={
              <Link
                to="/trips"
                className={cn(buttonVariants(), 'w-full sm:w-auto')}
              >
                {t('phone.back')}
              </Link>
            }
          />
        </main>
      </div>
    )
  }

  return (
    <PendingContext.Provider
      value={{ count, refresh: () => setTick((value) => value + 1) }}
    >
      <CapacityContext.Provider
        value={{ refresh: () => setCapacityTick((value) => value + 1) }}
      >
        <div className="flex h-dvh flex-col bg-background text-foreground">
          <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-border px-4">
            <p className="font-semibold">
              {t('appName')}
              <span className="text-muted">
                {t('admin.brandSep', { label: t('admin.label') })}
              </span>
            </p>
            <Link
              to="/trips"
              className={cn(
                hoverClass.link,
                'inline-flex min-h-11 items-center',
              )}
            >
              {t('admin.back')}
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <DevLoginBadge />
              <ThemeSwitch />
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <nav
              aria-label={t('admin.nav.label')}
              className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2 md:w-60 md:shrink-0 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:px-3 md:py-4"
            >
              {nav.map(([to, key, end]) => (
                <NavLink
                  key={key}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-[8px] px-3',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : hoverClass.tab,
                    )
                  }
                >
                  {key === 'requests' && count > 0
                    ? t('admin.nav.requestsCount', { count })
                    : t(`admin.nav.${key}`)}
                </NavLink>
              ))}
            </nav>
            <main
              tabIndex={0}
              className="min-h-0 flex-1 overflow-auto px-4 py-6 md:px-8"
            >
              {warning && level ? (
                <Link
                  to="/admin/storage"
                  data-testid="capacity-banner"
                  data-level={level}
                  className={cn(
                    hoverClass.card,
                    'mb-4 block rounded-[8px] border border-border bg-card px-4 py-3 text-foreground',
                    level === 'red'
                      ? 'border-l-4 border-l-danger'
                      : 'border-l-4 border-l-cat-home',
                  )}
                >
                  {t(
                    level === 'red'
                      ? 'admin.capacity.bannerRed'
                      : 'admin.capacity.bannerAmber',
                    { resource: t(`admin.capacity.${warning}`) },
                  )}
                </Link>
              ) : null}
              <Outlet />
            </main>
          </div>
        </div>
      </CapacityContext.Provider>
    </PendingContext.Provider>
  )
}
