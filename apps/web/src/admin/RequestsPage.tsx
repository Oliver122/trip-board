import type { AdminKindLimitRequest, QuotaRequest } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ErrorNotice } from '../components/notice'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { ErrorState, LoadingState } from '../components/states'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { megabytes } from '../images/format'
import { usePendingRequests } from './AdminLayout'
import {
  approveKindLimitRequest,
  approveRequest,
  bytesFromMb,
  listKindLimitRequests,
  listQuotaRequests,
  rejectKindLimitRequest,
  rejectRequest,
} from './client'

type Item =
  | { type: 'storage'; id: string; request: QuotaRequest }
  | { type: 'kinds'; id: string; request: AdminKindLimitRequest }

type TypeFilter = 'all' | Item['type']

async function loadItems(signal?: AbortSignal): Promise<Item[]> {
  const [storage, kinds] = await Promise.all([
    listQuotaRequests(signal),
    listKindLimitRequests(signal),
  ])
  return [
    ...storage.requests.map((request): Item => ({
      type: 'storage',
      id: request.id,
      request,
    })),
    ...kinds.requests.map((request): Item => ({
      type: 'kinds',
      id: request.id,
      request,
    })),
  ]
}

export function RequestsPage() {
  const { t } = useTranslation()
  const pending = usePendingRequests()
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState<TypeFilter>('all')

  function reload() {
    return loadItems().then((next) => {
      setItems(next)
      pending.refresh()
    })
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadItems(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setItems(next)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [])

  if (error) return <ErrorState />
  if (!items) return <LoadingState />

  const ordered = items
    .filter((item) => filter === 'all' || item.type === filter)
    .sort((a, b) => {
      const aPending = a.request.status === 'pending'
      const bPending = b.request.status === 'pending'
      if (aPending !== bPending) return aPending ? -1 : 1
      return b.request.createdAt.localeCompare(a.request.createdAt)
    })

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{t('admin.nav.requests')}</h1>
      <Select
        label={t('admin.requests.filterType')}
        value={filter}
        wrapperClassName="mb-4 max-w-xs"
        onChange={(event) => setFilter(event.target.value as TypeFilter)}
      >
        <option value="all">{t('admin.requests.allTypes')}</option>
        <option value="storage">{t('admin.requests.types.storage')}</option>
        <option value="kinds">{t('admin.requests.types.kinds')}</option>
      </Select>
      {ordered.length === 0 ? (
        <p className="text-muted">{t('admin.requests.empty')}</p>
      ) : (
        <ul className="space-y-4">
          {ordered.map((item) => (
            <li
              key={`${item.type}:${item.id}`}
              data-testid="request-item"
              data-type={item.type}
              className="max-w-xl rounded-[8px] border border-border p-4"
            >
              <p className="mb-1 flex gap-2 text-sm text-muted">
                <span>{t('admin.requests.type')}</span>
                <span data-testid="request-type">
                  {t(`admin.requests.types.${item.type}`)}
                </span>
              </p>
              {item.type === 'storage' ? (
                <StorageRequest
                  request={item.request}
                  onDone={() => {
                    void reload()
                  }}
                />
              ) : (
                <KindRequest
                  request={item.request}
                  onDone={() => {
                    void reload()
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function StorageRequest({
  request,
  onDone,
}: {
  request: QuotaRequest
  onDone: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
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
        <DecisionForm request={request} onDone={onDone} />
      ) : null}
      {request.decisionNote ? <p>{request.decisionNote}</p> : null}
    </>
  )
}

function KindRequest({
  request,
  onDone,
}: {
  request: AdminKindLimitRequest
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [maxKinds, setMaxKinds] = useState(String(request.requestedMax))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const value = Number(maxKinds)
  const valid = Number.isInteger(value) && value >= 1 && value <= 64

  return (
    <>
      <p className="font-semibold">
        <Link
          to={`/admin/trips/${request.tripId}`}
          className={cn(hoverClass.link, 'underline')}
        >
          {request.tripName}
        </Link>
      </p>
      <p>
        {t('admin.requests.kindSummary', {
          trip: request.tripName,
          requested: request.requestedMax,
          current: request.currentLimit,
          count: request.kindCount,
        })}
      </p>
      {request.requestedByName ? (
        <p className="text-sm text-muted">
          {t('admin.requests.by', { name: request.requestedByName })}
        </p>
      ) : null}
      {request.message ? <p>{request.message}</p> : null}
      <p>{t(`admin.requests.status.${request.status}`)}</p>
      {request.status === 'pending' ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!valid) return
            setError(null)
            void approveKindLimitRequest(request.id, {
              maxKinds: value,
              ...(note.trim() ? { note: note.trim() } : {}),
            })
              .then(onDone)
              .catch(() => setError(t('admin.user.errors.save')))
          }}
        >
          <label className="block">
            {t('admin.requests.maxKinds')}
            <input
              type="number"
              min={1}
              max={64}
              value={maxKinds}
              onChange={(event) => setMaxKinds(event.target.value)}
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
            <Button type="submit" disabled={!valid}>
              {t('admin.requests.approve')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void rejectKindLimitRequest(request.id, note.trim())
                  .then(onDone)
                  .catch(() => setError(t('admin.user.errors.save')))
              }}
            >
              {t('admin.requests.reject')}
            </Button>
          </div>
        </form>
      ) : null}
      {request.decisionNote ? <p>{request.decisionNote}</p> : null}
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
