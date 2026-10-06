import type { AuditEntry } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorState, LoadingState } from '../components/states'
import { formatDate } from '../lib/format'
import { activeLocale } from '../i18n'
import { listAudit } from './client'

export function AuditPage() {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const [admin, setAdmin] = useState('')
  const [target, setTarget] = useState('')
  const [action, setAction] = useState('')
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (isUuid(admin)) params.set('admin', admin)
    if (isUuid(target)) params.set('target', target)
    if (action.trim()) params.set('action', action.trim())
    const search = params.size > 0 ? `?${params.toString()}` : ''
    void listAudit(search, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setEntries(page.entries)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [admin, target, action])

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{t('admin.nav.audit')}</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={admin}
          onChange={(event) => setAdmin(event.target.value)}
          aria-label={t('admin.audit.admin')}
          placeholder={t('admin.audit.admin')}
          className="min-h-11 rounded-[8px] border border-border bg-card px-3"
        />
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          aria-label={t('admin.audit.target')}
          placeholder={t('admin.audit.target')}
          className="min-h-11 rounded-[8px] border border-border bg-card px-3"
        />
        <input
          value={action}
          onChange={(event) => setAction(event.target.value)}
          aria-label={t('admin.audit.action')}
          placeholder={t('admin.audit.action')}
          className="min-h-11 rounded-[8px] border border-border bg-card px-3"
        />
      </div>
      {error ? <ErrorState /> : null}
      {!entries && !error ? <LoadingState /> : null}
      {entries && entries.length === 0 ? (
        <p className="text-muted">{t('admin.audit.empty')}</p>
      ) : null}
      {entries && entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                {(['when', 'admin', 'action', 'target', 'reason'] as const).map(
                  (key) => (
                    <th
                      key={key}
                      scope="col"
                      className="border-b border-border px-2 py-2"
                    >
                      {t(`admin.audit.col.${key}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border">
                  <td className="px-2 py-2">
                    {formatDate(entry.createdAt, locale)}
                  </td>
                  <td className="px-2 py-2">
                    {entry.adminName ?? t('admin.trips.none')}
                  </td>
                  <td className="px-2 py-2 font-mono">{entry.action}</td>
                  <td className="px-2 py-2">
                    {entry.targetUserName ?? t('admin.trips.none')}
                  </td>
                  <td className="px-2 py-2">
                    {entry.reason ?? t('admin.trips.none')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  )
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  )
}
