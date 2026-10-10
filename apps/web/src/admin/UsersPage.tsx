import type { AdminUser } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ErrorState, LoadingState } from '../components/states'
import { Button } from '../components/ui/button'
import { hoverClass } from '../components/ui/hover'
import { Select } from '../components/ui/select'
import { cn } from '../lib/utils'
import { megabytes } from '../images/format'
import { formatDate } from '../lib/format'
import { activeLocale } from '../i18n'
import { listAdminUsers } from './client'

const sorts = [
  'username',
  'discordId',
  'role',
  'tripsMember',
  'spotsCreated',
  'usedBytes',
  'lastSeenAt',
  'createdAt',
] as const

export function UsersPage() {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<(typeof sorts)[number]>('createdAt')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ sort, dir })
    if (query.trim()) params.set('q', query.trim())
    if (filter) params.set('filter', filter)
    setLoading(true)
    void listAdminUsers(`?${params.toString()}`, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return
        setUsers(page.users)
        setCursor(page.nextCursor)
        setError(false)
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || reason instanceof DOMException) return
        setError(true)
        setLoading(false)
      })
    return () => controller.abort()
  }, [query, filter, sort, dir])

  function toggleSort(next: (typeof sorts)[number]) {
    if (sort === next) setDir((value) => (value === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(next)
      setDir('asc')
    }
  }

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{t('admin.nav.users')}</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t('admin.users.search')}
          placeholder={t('admin.users.search')}
          className="min-h-11 min-w-48 flex-1 rounded-[8px] border border-border bg-card px-3"
        />
        <Select
          label={t('admin.users.filters')}
          hideLabel
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="">{t('admin.users.filterAll')}</option>
          <option value="admins">{t('admin.users.filterAdmins')}</option>
          <option value="suspended">{t('admin.users.filterSuspended')}</option>
          <option value="quota">{t('admin.users.filterQuota')}</option>
          <option value="inactive">{t('admin.users.filterInactive')}</option>
        </Select>
      </div>
      {loading && !users ? <LoadingState /> : null}
      {error ? <ErrorState /> : null}
      {users && users.length === 0 ? (
        <p className="text-muted">{t('admin.users.empty')}</p>
      ) : null}
      {users && users.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                {sorts.map((key) => (
                  <th
                    key={key}
                    scope="col"
                    aria-sort={
                      sort === key
                        ? dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    className="border-b border-border px-2 py-2"
                  >
                    <button
                      type="button"
                      className={cn(
                        hoverClass.ghost,
                        'inline-flex min-h-11 items-center font-semibold',
                      )}
                      onClick={() => toggleSort(key)}
                    >
                      {t(`admin.users.col.${key}`)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border">
                  <td className="px-2 py-1">
                    <Link
                      to={`/admin/users/${user.id}`}
                      className={cn(
                        hoverClass.item,
                        'inline-flex min-h-11 items-center underline',
                      )}
                    >
                      {user.displayName ?? user.username}
                    </Link>
                  </td>
                  <td className="px-2 py-1">{user.discordId}</td>
                  <td className="px-2 py-1">
                    {user.appRole === 'admin'
                      ? t('admin.users.roleAdmin')
                      : t('admin.users.roleUser')}
                  </td>
                  <td className="px-2 py-1">
                    {user.suspendedAt
                      ? t('admin.users.suspended')
                      : t('admin.users.active')}
                  </td>
                  <td className="px-2 py-1">
                    {t('admin.users.tripCounts', {
                      joined: user.tripsMember,
                      owned: user.tripsOwned,
                    })}
                  </td>
                  <td className="px-2 py-1">{user.spotsCreated}</td>
                  <td className="px-2 py-1">
                    {t('admin.user.bytes', {
                      used: megabytes(user.usedBytes),
                      max: megabytes(user.maxBytes),
                    })}
                  </td>
                  <td className="px-2 py-1">
                    {user.lastSeenAt
                      ? formatDate(user.lastSeenAt, locale)
                      : t('admin.users.never')}
                  </td>
                  <td className="px-2 py-1">
                    {formatDate(user.createdAt, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {cursor ? (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => {
            const params = new URLSearchParams({ sort, dir, cursor })
            if (query.trim()) params.set('q', query.trim())
            if (filter) params.set('filter', filter)
            void listAdminUsers(`?${params.toString()}`).then((page) => {
              setUsers((current) => [...(current ?? []), ...page.users])
              setCursor(page.nextCursor)
            })
          }}
        >
          {t('admin.more')}
        </Button>
      ) : null}
    </>
  )
}
