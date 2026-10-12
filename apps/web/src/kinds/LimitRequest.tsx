import { kindErrorCodes, kindLimits } from '@tripboard/shared'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/http'
import { ErrorNotice } from '../components/notice'
import { Button } from '../components/ui/button'
import { createKindRequest } from './client'
import { setKindRequest, useLatestKindRequest } from './store'

const inputClass =
  'w-full min-h-11 rounded-[8px] border border-border bg-card px-3 text-foreground'

function seenKey(tripId: string) {
  return `tripboard.kindRequestSeen.${tripId}`
}

function readSeen(tripId: string): string | null {
  try {
    return localStorage.getItem(seenKey(tripId))
  } catch {
    return null
  }
}

function writeSeen(tripId: string, id: string) {
  try {
    localStorage.setItem(seenKey(tripId), id)
  } catch {
    // The notice then comes back next time; harmless.
  }
}

/**
 * The kind limit hint, the pending request or its result, and the form that
 * asks the platform admin for more kinds. Board admins and the owner only.
 */
export function LimitRequest({
  tripId,
  limit,
  full,
  onAuthError,
}: {
  tripId: string
  limit: number
  full: boolean
  onAuthError: (caught: unknown) => boolean
}) {
  const { t } = useTranslation()
  const { request, error: loadFailed } = useLatestKindRequest(tripId)
  const [seen, setSeen] = useState(() => readSeen(tripId))
  const [open, setOpen] = useState(false)
  const pending = request?.status === 'pending'
  const decided = request && !pending && request.id !== seen
  const canAsk = full && !pending && limit < kindLimits.ceiling

  return (
    <div className="flex flex-col gap-2" data-testid="kind-limit">
      {full ? (
        <p className="text-sm text-muted" data-testid="kind-limit-hint">
          {t('kinds.limitReached')}
        </p>
      ) : null}
      {pending ? (
        <p className="text-sm" role="status" data-testid="kind-request-pending">
          {t('kinds.request.pending', { count: request.requestedMax })}
        </p>
      ) : null}
      {decided ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-[8px] border border-border bg-background p-2 text-sm"
          role="status"
          data-testid="kind-request-result"
        >
          <div className="min-w-40 flex-1">
            <p>
              {t(`kinds.request.${request.status as 'approved' | 'rejected'}`, {
                count: request.requestedMax,
              })}
            </p>
            {request.decisionNote ? (
              <p className="text-muted">
                {t('kinds.request.note', { note: request.decisionNote })}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              writeSeen(tripId, request.id)
              setSeen(request.id)
            }}
          >
            {t('kinds.request.dismiss')}
          </Button>
        </div>
      ) : null}
      {loadFailed && !request ? (
        <p className="text-sm text-muted">{t('kinds.request.loadError')}</p>
      ) : null}
      {canAsk && !open ? (
        <div>
          <Button
            type="button"
            variant="outline"
            data-testid="kind-request-open"
            onClick={() => setOpen(true)}
          >
            {t('kinds.requestMore')}
          </Button>
        </div>
      ) : null}
      {canAsk && open ? (
        <RequestForm
          tripId={tripId}
          limit={limit}
          onAuthError={onAuthError}
          onDone={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}

function RequestForm({
  tripId,
  limit,
  onAuthError,
  onDone,
  onCancel,
}: {
  tripId: string
  limit: number
  onAuthError: (caught: unknown) => boolean
  onDone: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [max, setMax] = useState(
    String(Math.min(limit + 1, kindLimits.ceiling)),
  )
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const number = Number(max)
  const valid =
    Number.isInteger(number) && number > limit && number <= kindLimits.ceiling

  async function submit() {
    if (!valid) {
      setError(t('kinds.request.invalidMax', { limit }))
      return
    }
    setBusy(true)
    setError('')
    try {
      const text = message.trim()
      const created = await createKindRequest(tripId, {
        requestedMax: number,
        ...(text ? { message: text } : {}),
      })
      setKindRequest(tripId, created)
      onDone()
    } catch (caught) {
      if (onAuthError(caught)) return
      if (
        caught instanceof ApiError &&
        (kindErrorCodes as readonly string[]).includes(caught.code)
      ) {
        setError(t(`kinds.errors.${caught.code}`, { limit }))
      } else if (caught instanceof ApiError && caught.status === 400) {
        setError(t('kinds.request.invalidMax', { limit }))
      } else {
        setError(t('kinds.errors.generic'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 rounded-[8px] border border-border bg-background p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <h3 id={`${id}-title`} className="text-base font-semibold">
        {t('kinds.request.title')}
      </h3>
      <div>
        <label htmlFor={`${id}-max`} className="mb-1 block text-sm">
          {t('kinds.request.number')}
        </label>
        <input
          id={`${id}-max`}
          type="number"
          inputMode="numeric"
          min={limit + 1}
          max={kindLimits.ceiling}
          value={max}
          disabled={busy}
          onChange={(event) => setMax(event.target.value)}
          className={`${inputClass} max-w-32`}
        />
      </div>
      <div>
        <label htmlFor={`${id}-message`} className="mb-1 block text-sm">
          {t('kinds.request.message')}
        </label>
        <textarea
          id={`${id}-message`}
          value={message}
          maxLength={500}
          rows={2}
          disabled={busy}
          onChange={(event) => setMessage(event.target.value)}
          className="w-full rounded-[8px] border border-border bg-card px-3 py-2 text-foreground"
        />
      </div>
      {error ? (
        <ErrorNotice testId="kind-request-error">{error}</ErrorNotice>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {t('kinds.request.send')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('ui.cancel')}
        </Button>
      </div>
    </form>
  )
}
