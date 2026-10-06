import type { QuotaRequest } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ErrorNotice } from '../components/notice'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { ErrorState, LoadingState } from '../components/states'
import { Button } from '../components/ui/button'
import { megabytes } from '../images/format'
import { usePendingRequests } from './AdminLayout'
import {
  approveRequest,
  bytesFromMb,
  listQuotaRequests,
  rejectRequest,
} from './client'

export function RequestsPage() {
  const { t } = useTranslation()
  const pending = usePendingRequests()
  const [requests, setRequests] = useState<QuotaRequest[] | null>(null)
  const [error, setError] = useState(false)

  function reload() {
    return listQuotaRequests().then((page) => {
      setRequests(page.requests)
      pending.refresh()
    })
  }

  useEffect(() => {
    const controller = new AbortController()
    void listQuotaRequests(controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setRequests(page.requests)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [])

  if (error) return <ErrorState />
  if (!requests) return <LoadingState />

  const ordered = [...requests].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (b.status === 'pending' && a.status !== 'pending') return 1
    return 0
  })

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{t('admin.nav.requests')}</h1>
      {ordered.length === 0 ? (
        <p className="text-muted">{t('admin.requests.empty')}</p>
      ) : (
        <ul className="space-y-4">
          {ordered.map((request) => (
            <li
              key={request.id}
              className="max-w-xl rounded-[8px] border border-border p-4"
            >
              <p className="font-semibold">
                <Link
                  to={`/admin/users/${request.userId}`}
                  className={cn(hoverClass.link, 'underline')}
                >
                  {request.displayName ?? request.username}
                </Link>
              </p>
              <p>{requestChange(t, request)}</p>
              {request.message ? <p>{request.message}</p> : null}
              <p className="text-sm text-muted">
                {t('admin.requests.usage', {
                  images: request.usedImages,
                  maxImages: request.maxImages,
                  used: megabytes(request.usedBytes),
                  max: megabytes(request.maxBytes),
                })}
              </p>
              <p>{t(`admin.requests.status.${request.status}`)}</p>
              {request.status === 'pending' ? (
                <DecisionForm
                  request={request}
                  onDone={() => {
                    void reload()
                  }}
                />
              ) : null}
              {request.decisionNote ? <p>{request.decisionNote}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function DecisionForm({
  request,
  onDone,
}: {
  request: QuotaRequest
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [images, setImages] = useState(
    request.requestedImages ? String(request.requestedImages) : '',
  )
  const [storage, setStorage] = useState(
    request.requestedBytes ? String(megabytes(request.requestedBytes)) : '',
  )
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        const body: { images?: number; bytes?: number; note?: string } = {}
        if (images.trim()) body.images = Number(images)
        if (storage.trim()) body.bytes = bytesFromMb(Number(storage))
        if (note.trim()) body.note = note.trim()
        void approveRequest(request.id, body)
          .then(onDone)
          .catch(() => setError(t('admin.user.errors.save')))
      }}
    >
      <label className="block">
        {t('admin.user.images')}
        <input
          type="number"
          min={1}
          value={images}
          onChange={(event) => setImages(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
        />
      </label>
      <label className="block">
        {t('admin.requests.extraMb')}
        <input
          type="number"
          min={1}
          value={storage}
          onChange={(event) => setStorage(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
        />
      </label>
      <label className="block">
        {t('admin.requests.note')}
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
        />
      </label>
      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit">{t('admin.requests.approve')}</Button>
        <Button
          variant="danger"
          onClick={() => {
            void rejectRequest(request.id, note.trim())
              .then(onDone)
              .catch(() => setError(t('admin.user.errors.save')))
          }}
        >
          {t('admin.requests.reject')}
        </Button>
      </div>
    </form>
  )
}

function requestChange(
  t: (key: string, options?: Record<string, unknown>) => string,
  request: QuotaRequest,
) {
  const parts: string[] = []
  if (request.requestedImages) {
    parts.push(
      t('admin.requests.plusImages', { count: request.requestedImages }),
    )
  }
  if (request.requestedBytes) {
    parts.push(
      t('admin.requests.plusMb', { count: megabytes(request.requestedBytes) }),
    )
  }
  return parts.join(', ')
}
