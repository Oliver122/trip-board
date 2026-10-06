import type { AdminUserDetail } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ErrorNotice } from '../components/notice'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { Dialog } from '../spots/Dialog'
import { ErrorState, LoadingState } from '../components/states'
import { Button } from '../components/ui/button'
import { megabytes } from '../images/format'
import { activeLocale } from '../i18n'
import { activitySentence } from './activity-text'
import { Sparkline } from './Sparkline'
import { useSession } from '../session'
import {
  bytesFromMb,
  getAdminUser,
  logoutEverywhere,
  patchQuota,
  setAdminRole,
  suspendUser,
  unsuspendUser,
} from './client'

export function UserPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [error, setError] = useState(false)
  const [missing, setMissing] = useState(false)
  const [extend, setExtend] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  function reload() {
    return getAdminUser(id)
      .then((next) => {
        setDetail(next)
        setError(false)
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.message === 'missing')
          setMissing(true)
        else setError(true)
      })
  }

  useEffect(() => {
    const controller = new AbortController()
    void getAdminUser(id, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setDetail(next)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        if (reason instanceof Error && reason.message === 'missing')
          setMissing(true)
        else setError(true)
      })
    return () => controller.abort()
  }, [id])

  if (missing) return <p>{t('admin.users.missing')}</p>
  if (error) return <ErrorState />
  if (!detail) return <LoadingState />

  const { user } = detail
  const ratio = user.maxBytes > 0 ? user.usedBytes / user.maxBytes : 0

  async function run(action: () => Promise<void>) {
    setActionError(null)
    try {
      await action()
      await reload()
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : 'save'
      setActionError(
        t(`admin.user.errors.${code}`, {
          defaultValue: t('admin.user.errors.save'),
        }),
      )
    }
  }

  return (
    <>
      <p className="mb-2">
        <Link to="/admin/users" className={cn(hoverClass.link, 'underline')}>
          {t('admin.nav.users')}
        </Link>
      </p>
      <h1 className="mb-1 text-xl font-semibold">
        {user.displayName ?? user.username}
      </h1>
      <p className="mb-4 text-muted">
        {t('admin.user.meta', {
          username: user.username,
          discordId: user.discordId,
        })}
      </p>
      {actionError ? (
        <ErrorNotice className="mb-3">{actionError}</ErrorNotice>
      ) : null}
      <div className="mb-6 flex flex-wrap gap-2">
        <Button onClick={() => setExtend(true)}>
          {t('admin.user.extend')}
        </Button>
        {user.suspendedAt ? (
          <Button
            variant="outline"
            onClick={() => void run(() => unsuspendUser(user.id))}
          >
            {t('admin.user.unsuspend')}
          </Button>
        ) : (
          <SuspendButton
            onSuspend={(reason) => run(() => suspendUser(user.id, reason))}
          />
        )}
        <Button
          variant="outline"
          onClick={() =>
            void run(() =>
              setAdminRole(
                user.id,
                user.appRole === 'admin' ? 'user' : 'admin',
              ),
            )
          }
        >
          {user.appRole === 'admin'
            ? t('admin.user.removeAdmin')
            : t('admin.user.makeAdmin')}
        </Button>
        <Button
          variant="outline"
          onClick={() => void run(() => logoutEverywhere(user.id))}
        >
          {t('admin.user.logoutAll')}
        </Button>
      </div>
      <section
        className="mb-6 max-w-xl space-y-3"
        aria-labelledby="storage-heading"
      >
        <h2 id="storage-heading" className="font-semibold">
          {t('account.storage')}
        </h2>
        <progress
          aria-label={t('admin.user.images')}
          value={user.usedImages}
          max={Math.max(user.maxImages, 1)}
          className="h-2 w-full"
        />
        <p>
          {t('admin.user.imagesCount', {
            used: user.usedImages,
            max: user.maxImages,
          })}
        </p>
        <progress
          aria-label={t('account.storage')}
          value={user.usedBytes}
          max={Math.max(user.maxBytes, 1)}
          className="h-2 w-full"
        />
        <p data-testid="storage-bytes">
          {t('admin.user.bytes', {
            used: megabytes(user.usedBytes),
            max: megabytes(user.maxBytes),
          })}
        </p>
        <p data-testid="storage-limit">
          {user.hasOverride
            ? t('admin.user.limitOverride')
            : t('admin.user.limitDefault')}
        </p>
        {ratio >= 0.8 ? <p>{t('admin.user.nearLimit')}</p> : null}
      </section>
      <section className="mb-6" aria-labelledby="trips-heading">
        <h2 id="trips-heading" className="mb-2 font-semibold">
          {t('admin.user.trips')}
        </h2>
        {detail.trips.length === 0 ? (
          <p className="text-muted">{t('admin.user.noTrips')}</p>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="border-b border-border px-2 py-2">
                  {t('admin.trips.col.name')}
                </th>
                <th scope="col" className="border-b border-border px-2 py-2">
                  {t('admin.user.role')}
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.trips.map((trip) => (
                <tr key={trip.id}>
                  <td className="px-2 py-2">
                    <Link
                      to={`/admin/trips/${trip.id}`}
                      className={cn(hoverClass.link, 'underline')}
                    >
                      {trip.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{t(`trips.roles.${trip.role}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <Sparkline
        values={detail.sparkline}
        href={`/admin/activity?user=${user.id}`}
      />
      <RequestList detail={detail} />
      <ActionList detail={detail} />
      {extend ? (
        <ExtendDialog
          detail={detail}
          onClose={() => setExtend(false)}
          onSaved={async () => {
            setExtend(false)
            await reload()
          }}
        />
      ) : null}
    </>
  )
}

function SuspendButton({ onSuspend }: { onSuspend: (reason: string) => void }) {
  const { t } = useTranslation()
  const { user } = useSession()
  const params = useParams()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  if (user?.id === params.id) return null
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        {t('admin.user.suspend')}
      </Button>
      {open ? (
        <Dialog
          title={t('admin.user.suspend')}
          closeLabel={t('trips.cancel')}
          onClose={() => setOpen(false)}
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!reason.trim()) return
              onSuspend(reason.trim())
              setOpen(false)
            }}
          >
            <label className="block">
              {t('admin.user.reason')}
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
              />
            </label>
            <Button type="submit" variant="dangerSolid">
              {t('admin.user.suspend')}
            </Button>
          </form>
        </Dialog>
      ) : null}
    </>
  )
}

function ExtendDialog({
  detail,
  onClose,
  onSaved,
}: {
  detail: AdminUserDetail
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { t } = useTranslation()
  const { user, defaults } = detail
  const [images, setImages] = useState(String(user.maxImages))
  const [storage, setStorage] = useState(String(megabytes(user.maxBytes)))
  const [reset, setReset] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nextImages = reset ? defaults.maxImages : Number(images)
  const nextBytes = reset ? defaults.maxBytes : bytesFromMb(Number(storage))
  const below =
    Number.isFinite(nextImages) &&
    Number.isFinite(nextBytes) &&
    (nextImages < user.usedImages || nextBytes < user.usedBytes)

  return (
    <Dialog
      title={t('admin.user.extend')}
      closeLabel={t('trips.cancel')}
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          const body = reset
            ? { reset: true, reason: reason.trim() || undefined }
            : {
                maxImages: Number(images),
                maxBytes: bytesFromMb(Number(storage)),
                reason: reason.trim() || undefined,
              }
          void patchQuota(user.id, body)
            .then(() => onSaved())
            .catch(() => setError(t('admin.user.errors.save')))
        }}
      >
        <label className="block">
          {t('admin.user.images')}
          <input
            type="number"
            min={0}
            value={images}
            disabled={reset}
            onChange={(event) => setImages(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
          />
        </label>
        <label className="block">
          {t('admin.user.storageMb')}
          <input
            type="number"
            min={0}
            value={storage}
            disabled={reset}
            onChange={(event) => setStorage(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
          />
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={reset}
            onChange={(event) => setReset(event.target.checked)}
          />
          {t('admin.user.reset')}
        </label>
        <label className="block">
          {t('admin.user.reason')}
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
          />
        </label>
        {below ? <p role="status">{t('admin.user.belowUsage')}</p> : null}
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        <div className="flex gap-2">
          <Button type="submit">{t('trips.save')}</Button>
          <Button variant="outline" onClick={onClose}>
            {t('trips.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function RequestList({ detail }: { detail: AdminUserDetail }) {
  const { t } = useTranslation()
  return (
    <section className="mb-6" aria-labelledby="requests-heading">
      <h2 id="requests-heading" className="mb-2 font-semibold">
        {t('admin.nav.requests')}
      </h2>
      {detail.quotaRequests.length === 0 ? (
        <p className="text-muted">{t('admin.requests.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {detail.quotaRequests.map((request) => (
            <li
              key={request.id}
              className="rounded-[8px] border border-border px-3 py-2"
            >
              <p>{t(`admin.requests.status.${request.status}`)}</p>
              {request.message ? <p>{request.message}</p> : null}
              {request.decisionNote ? <p>{request.decisionNote}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ActionList({ detail }: { detail: AdminUserDetail }) {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  return (
    <section aria-labelledby="actions-heading">
      <h2 id="actions-heading" className="mb-2 font-semibold">
        {t('admin.user.actions')}
      </h2>
      {detail.actions.length === 0 ? (
        <p className="text-muted">{t('admin.user.noActions')}</p>
      ) : (
        <ul className="space-y-1">
          {detail.actions.map((action) => (
            <li key={action.id}>
              {activitySentence(
                {
                  action: action.action,
                  actorName: action.actorName,
                  tripName: action.tripName,
                  metadata: action.metadata,
                },
                locale,
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
