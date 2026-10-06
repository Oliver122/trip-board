import type { Quota, QuotaRequest } from '@tripboard/shared'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  bytesFromMb,
  createQuotaRequest,
  listMyQuotaRequests,
} from '../admin/client'
import { LanguageSwitch, ThemeSwitch } from '../components/Preferences'
import { useListFollowsMap } from '../list-follows-map'
import { ErrorNotice } from '../components/notice'
import { Button } from '../components/ui/button'
import { getQuota } from '../images/client'
import { megabytes } from '../images/format'
import { Dialog } from '../spots/Dialog'
import { useSession } from '../session'

export function AccountPage() {
  const { t } = useTranslation()
  const { user } = useSession()
  const { enabled: listFollowsMap, setEnabled: setListFollowsMap } =
    useListFollowsMap()
  const storageId = useId()
  const settingsId = useId()
  const [quota, setQuota] = useState<Quota | null>(null)
  const [requests, setRequests] = useState<QuotaRequest[]>([])
  const [requestOpen, setRequestOpen] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      getQuota(controller.signal),
      listMyQuotaRequests(controller.signal),
    ])
      .then(([next, page]) => {
        if (controller.signal.aborted) return
        setQuota(next)
        setRequests(page.requests)
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
          <ErrorNotice>{t('account.quotaError')}</ErrorNotice>
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
            <RequestStatus requests={requests} />
            {requests.some((request) => request.status === 'pending') ? (
              <p>{t('account.requestPending')}</p>
            ) : (
              <Button variant="outline" onClick={() => setRequestOpen(true)}>
                {t('account.requestMore')}
              </Button>
            )}
          </>
        ) : null}
      </section>
      {requestOpen ? (
        <RequestDialog
          onClose={() => setRequestOpen(false)}
          onCreated={(request) => {
            setRequests((current) => [request, ...current])
            setRequestOpen(false)
          }}
        />
      ) : null}
      <section aria-labelledby={settingsId} className="space-y-4">
        <h2 id={settingsId} className="text-base font-semibold">
          {t('account.settings')}
        </h2>
        <div>
          <p className="mb-2 text-sm font-semibold">{t('header.language')}</p>
          <LanguageSwitch />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t('header.theme')}</p>
          <ThemeSwitch />
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            data-testid="list-follows-map"
            checked={listFollowsMap}
            onChange={(event) => setListFollowsMap(event.target.checked)}
          />
          {t('account.listFollowsMap')}
        </label>
      </section>
    </main>
  )
}

function RequestStatus({ requests }: { requests: QuotaRequest[] }) {
  const { t } = useTranslation()
  const latest = requests.find((request) => request.status !== 'pending')
  if (!latest || latest.status === 'pending') return null
  if (latest.status === 'rejected') {
    return (
      <div>
        <p>{t('account.requestRejected')}</p>
        {latest.decisionNote ? (
          <p>{t('account.requestNote', { note: latest.decisionNote })}</p>
        ) : null}
      </div>
    )
  }
  return (
    <div>
      <p>{t('account.requestApproved', { change: changeLabel(t, latest) })}</p>
      {latest.decisionNote ? (
        <p>{t('account.requestNote', { note: latest.decisionNote })}</p>
      ) : null}
    </div>
  )
}

function RequestDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (request: QuotaRequest) => void
}) {
  const { t } = useTranslation()
  const [images, setImages] = useState('')
  const [storage, setStorage] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog
      title={t('account.requestTitle')}
      closeLabel={t('trips.cancel')}
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          const body: { images?: number; bytes?: number; message?: string } = {}
          if (images.trim()) body.images = Number(images)
          if (storage.trim()) body.bytes = bytesFromMb(Number(storage))
          if (message.trim()) body.message = message.trim()
          if (!body.images && !body.bytes) {
            setError(t('account.requestInvalid'))
            return
          }
          setError(null)
          void createQuotaRequest(body)
            .then(onCreated)
            .catch((reason: unknown) => {
              const code = reason instanceof Error ? reason.message : 'save'
              setError(
                code === 'invalid'
                  ? t('account.requestInvalid')
                  : t('account.requestError'),
              )
            })
        }}
      >
        <label className="block">
          {t('account.requestImages')}
          <input
            type="number"
            min={1}
            value={images}
            onChange={(event) => setImages(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
          />
        </label>
        <label className="block">
          {t('account.requestBytes')}
          <input
            type="number"
            min={1}
            value={storage}
            onChange={(event) => setStorage(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
          />
        </label>
        <label className="block">
          {t('account.requestMessage')}
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="mt-1 min-h-24 w-full rounded-[8px] border border-border bg-card px-3 py-2"
          />
        </label>
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        <Button type="submit">{t('account.requestSubmit')}</Button>
      </form>
    </Dialog>
  )
}

function changeLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  request: QuotaRequest,
) {
  const parts: string[] = []
  if (request.requestedImages) {
    parts.push(t('account.plusImages', { count: request.requestedImages }))
  }
  if (request.requestedBytes) {
    parts.push(
      t('account.plusMb', { count: megabytes(request.requestedBytes) }),
    )
  }
  return parts.join(', ')
}
