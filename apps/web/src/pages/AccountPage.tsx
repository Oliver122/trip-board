import type { Quota } from '@tripboard/shared'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch, ThemeSwitch } from '../components/Preferences'
import { getQuota } from '../images/client'
import { megabytes } from '../images/format'
import { useSession } from '../session'

export function AccountPage() {
  const { t } = useTranslation()
  const { user } = useSession()
  const storageId = useId()
  const [quota, setQuota] = useState<Quota | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    void getQuota(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return
        setQuota(next)
        setStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })
    return () => controller.abort()
  }, [])

  if (!user) return null

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="mb-2 text-xl font-semibold">{t('account.title')}</h1>
      <p className="mb-6">
        {t('account.signedIn', { name: user.displayName ?? user.username })}
      </p>
      <section aria-labelledby={storageId} className="mb-6 space-y-3">
        <h2 id={storageId} className="text-base font-semibold">
          {t('account.storage')}
        </h2>
        {status === 'loading' ? <p>{t('account.quotaLoading')}</p> : null}
        {status === 'error' ? (
          <p role="alert">{t('account.quotaError')}</p>
        ) : null}
        {quota ? (
          <>
            <progress
              aria-label={t('account.storage')}
              value={quota.usedBytes}
              max={Math.max(quota.maxBytes, 1)}
              className="h-2 w-full"
            />
            <p data-testid="account-quota">
              {t('account.quota', {
                used: quota.usedImages,
                max: quota.maxImages,
                usedMb: megabytes(quota.usedBytes),
                maxMb: megabytes(quota.maxBytes),
              })}
            </p>
          </>
        ) : null}
      </section>
      <div className="flex flex-wrap gap-3">
        <LanguageSwitch />
        <ThemeSwitch />
      </div>
    </main>
  )
}
