import type {
  InviteRole,
  Member,
  MemberRole,
  TripInvite,
  TripRole,
} from '@tripboard/shared'
import { Copy, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ErrorNotice } from '../components/notice'
import { ErrorState, LoadingState } from '../components/states'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { useDataSaver } from '../lib/data-saver'
import { onMembersRefresh } from '../live/bus'
import { useSession } from '../session'
import { isAuth, request } from '../api/http'
import { DialogFrame } from '../trips/CreateTripDialog'
import { roleName } from '../trips/TripCard'
import {
  createInvite,
  daysUntil,
  inviteUrl,
  leaveTrip,
  listInvites,
  listMembers,
  removeMember,
  revokeInvite,
  transferOwnership,
  updateMemberRole,
} from './client'

export function MembersDialog({
  tripId,
  onClose,
}: {
  tripId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { reload } = useSession()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [role, setRole] = useState<TripRole | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<TripInvite[]>([])
  const [inviteRole, setInviteRole] = useState<InviteRole>('visitor')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<
    | { kind: 'transfer'; userId: string; name: string }
    | { kind: 'leave' }
    | null
  >(null)
  const [attempt, setAttempt] = useState(0)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError('')
    void (async () => {
      try {
        const tripResponse = await request(`/api/trips/${tripId}`, {
          signal: controller.signal,
        })
        const trip = (await tripResponse.json()) as { role?: TripRole }
        const nextRole = trip.role ?? 'visitor'
        const nextMembers = await listMembers(tripId, controller.signal)
        const nextInvites =
          nextRole === 'owner'
            ? await listInvites(tripId, controller.signal)
            : []
        if (controller.signal.aborted) return
        setRole(nextRole)
        setMembers(nextMembers)
        setInvites(nextInvites)
        setStatus('ready')
      } catch (caught) {
        if (controller.signal.aborted) return
        if (isAuth(caught)) {
          reload()
          onCloseRef.current()
          return
        }
        setStatus('error')
      }
    })()
    return () => controller.abort()
  }, [attempt, reload, tripId])

  useEffect(() => onMembersRefresh(() => setAttempt((value) => value + 1)), [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (caught) {
      if (isAuth(caught)) {
        reload()
        onClose()
        return
      }
      setError(t('members.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const others = members.filter((member) => member.role !== 'owner')

  return (
    <DialogFrame title={t('members.title')} onClose={onClose}>
      <div className="mb-4 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          {t('members.close')}
        </Button>
      </div>
      {status === 'loading' ? <LoadingState /> : null}
      {status === 'error' ? (
        <ErrorState
          message={t('members.loadError')}
          retry={() => setAttempt((value) => value + 1)}
        />
      ) : null}
      {status === 'ready' && confirm?.kind === 'transfer' ? (
        <Confirm
          title={t('members.transferTitle')}
          body={t('members.transferBody', { name: confirm.name })}
          confirmLabel={t('members.transferConfirm')}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const target = confirm
            void run(async () => {
              const next = await transferOwnership(tripId, target.userId)
              setMembers(next)
              setRole('planner')
              setInvites([])
              setConfirm(null)
            })
          }}
        />
      ) : null}
      {status === 'ready' && confirm?.kind === 'leave' ? (
        <Confirm
          title={t('members.leaveTitle')}
          body={t('members.leaveBody')}
          confirmLabel={t('members.leaveConfirm')}
          danger
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            void run(async () => {
              await leaveTrip(tripId)
              onClose()
              navigate('/trips')
            })
          }}
        />
      ) : null}
      {status === 'ready' && !confirm ? (
        <div className="space-y-4">
          {error ? <ErrorNotice>{error}</ErrorNotice> : null}
          <ul className="space-y-2" aria-label={t('members.title')}>
            {members.map((member) => (
              <li
                key={member.userId}
                className="flex items-center gap-3"
                data-testid={`member-${member.userId}`}
              >
                <Avatar member={member} />
                <span className="min-w-0 flex-1 truncate">{member.name}</span>
                {role === 'owner' && member.role !== 'owner' ? (
                  <>
                    <Select
                      id={`role-${member.userId}`}
                      label={t('members.changeRole', {
                        name: member.name,
                      })}
                      hideLabel
                      value={member.role}
                      disabled={busy}
                      onChange={(event) => {
                        const next = event.target.value
                        if (!isMemberRole(next)) return
                        void run(async () => {
                          const updated = await updateMemberRole(
                            tripId,
                            member.userId,
                            next,
                          )
                          setMembers((current) =>
                            current.map((item) =>
                              item.userId === updated.userId ? updated : item,
                            ),
                          )
                        })
                      }}
                    >
                      <option value="admin">{t('trips.roles.admin')}</option>
                      <option value="planner">
                        {t('trips.roles.planner')}
                      </option>
                      <option value="visitor">
                        {t('trips.roles.visitor')}
                      </option>
                    </Select>
                    <Button
                      variant="danger"
                      aria-label={t('members.remove', { name: member.name })}
                      disabled={busy}
                      onClick={() => {
                        void run(async () => {
                          await removeMember(tripId, member.userId)
                          setMembers((current) =>
                            current.filter(
                              (item) => item.userId !== member.userId,
                            ),
                          )
                        })
                      }}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </>
                ) : (
                  <span className="text-muted">{roleName(t, member.role)}</span>
                )}
              </li>
            ))}
          </ul>
          {role === 'owner' ? (
            <section className="space-y-3 border-t border-border pt-4">
              <h3 className="font-semibold">{t('invite.section')}</h3>
              <p className="text-sm text-muted">{t('invite.singleUse')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  id="invite-role"
                  label={t('invite.role')}
                  hideLabel
                  value={inviteRole}
                  disabled={busy}
                  onChange={(event) => {
                    const next = event.target.value
                    if (next === 'planner' || next === 'visitor')
                      setInviteRole(next)
                  }}
                >
                  <option value="visitor">{t('trips.roles.visitor')}</option>
                  <option value="planner">{t('trips.roles.planner')}</option>
                </Select>
                <Button
                  disabled={busy}
                  onClick={() => {
                    void run(async () => {
                      const created = await createInvite(tripId, inviteRole)
                      setInvites((current) => [created, ...current])
                    })
                  }}
                >
                  {t('invite.create')}
                </Button>
              </div>
              {invites.length === 0 ? (
                <p className="text-muted">{t('invite.empty')}</p>
              ) : (
                <ul className="space-y-3">
                  {invites.map((invite) => {
                    const url = inviteUrl(invite.code)
                    return (
                      <li
                        key={invite.id}
                        className="rounded-[8px] border border-border p-3"
                        data-testid="invite-card"
                      >
                        <p className="font-mono" data-testid="invite-code">
                          {invite.code}
                        </p>
                        <p className="text-sm text-muted">
                          {t('invite.expiresIn', {
                            count: daysUntil(invite.expiresAt),
                          })}
                        </p>
                        <p data-testid="invite-role">
                          {roleName(t, invite.role)}
                        </p>
                        <p
                          className="truncate text-sm"
                          data-testid="invite-url"
                        >
                          {url}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              void run(async () => {
                                await navigator.clipboard.writeText(url)
                                setCopiedId(invite.id)
                              })
                            }}
                          >
                            <Copy aria-hidden="true" className="size-4" />
                            {copiedId === invite.id
                              ? t('invite.copied')
                              : t('invite.copy')}
                          </Button>
                          <Button
                            variant="danger"
                            aria-label={t('invite.revoke')}
                            disabled={busy}
                            onClick={() => {
                              void run(async () => {
                                await revokeInvite(invite.id)
                                setInvites((current) =>
                                  current.filter(
                                    (item) => item.id !== invite.id,
                                  ),
                                )
                              })
                            }}
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {others.length > 0 ? (
                <TransferForm
                  members={others}
                  busy={busy}
                  onTransfer={(userId, name) =>
                    setConfirm({ kind: 'transfer', userId, name })
                  }
                />
              ) : null}
              <p className="text-sm text-muted">{t('members.ownerStays')}</p>
            </section>
          ) : (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => setConfirm({ kind: 'leave' })}
            >
              {t('members.leave')}
            </Button>
          )}
        </div>
      ) : null}
    </DialogFrame>
  )
}

function isMemberRole(value: string): value is MemberRole {
  return value === 'admin' || value === 'planner' || value === 'visitor'
}

function TransferForm({
  members,
  busy,
  onTransfer,
}: {
  members: Member[]
  busy: boolean
  onTransfer: (userId: string, name: string) => void
}) {
  const { t } = useTranslation()
  const selectId = useId()
  const [userId, setUserId] = useState(members[0]?.userId ?? '')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        id={selectId}
        label={t('members.transfer')}
        hideLabel
        value={userId}
        disabled={busy}
        onChange={(event) => setUserId(event.target.value)}
      >
        {members.map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.name}
          </option>
        ))}
      </Select>
      <Button
        variant="outline"
        disabled={busy || !userId}
        onClick={() => {
          const member = members.find((item) => item.userId === userId)
          if (member) onTransfer(member.userId, member.name)
        }}
      >
        {t('members.transfer')}
      </Button>
    </div>
  )
}

function Confirm({
  title,
  body,
  confirmLabel,
  busy,
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  busy: boolean
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="mb-4">{body}</p>
      <div className="flex gap-2">
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          {t('members.cancel')}
        </Button>
        <Button
          variant={danger ? 'dangerSolid' : 'default'}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}

function Avatar({ member }: { member: Member }) {
  const { on: lowData } = useDataSaver()
  if (member.avatarUrl && !lowData) {
    return (
      <img
        src={member.avatarUrl}
        alt=""
        width={28}
        height={28}
        className="size-7 rounded-full object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-7 items-center justify-center rounded-full bg-border text-sm"
    >
      {member.name.slice(0, 1).toUpperCase()}
    </span>
  )
}
