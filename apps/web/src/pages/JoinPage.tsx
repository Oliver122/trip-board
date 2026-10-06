import { joinPreviewSchema, type JoinPreview } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { ErrorState, LoadingState } from '../components/states'
import { Button, buttonVariants } from '../components/ui/button'
import { cn } from '../lib/utils'
import { acceptJoin } from '../members/client'
import { useSession } from '../session'
import { AuthError } from '../trips/client'
import { roleName } from '../trips/TripCard'

type JoinState = 'loading' | 'ready' | 'expired' | 'unknown' | 'error'

export function JoinPage() {
  const { t } = useTranslation()
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const session = useSession()
  const [state, setState] = useState<JoinState>('loading')
  const [preview, setPreview] = useState<JoinPreview | null>(null)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState('loading')
    setPreview(null)
    setJoinError('')
    void fetch(`/api/join/${encodeURIComponent(code)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 410) {
          setState('expired')
          return
        }
        if (response.status === 404 || response.status === 400) {
          setState('unknown')
          return
        }
        if (!response.ok) throw new Error('load')
        setPreview(joinPreviewSchema.parse(await response.json()))
        setState('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof Error && error.name === 'AbortError') return
        setState('error')
      })
    return () => controller.abort()
  }, [attempt, code])

  async function join() {
    setJoining(true)
    setJoinError('')
    try {
      const tripId = await acceptJoin(code)
      navigate(`/trips/${tripId}`)
    } catch (error) {
      if (error instanceof AuthError) {
        session.reload()
        return
      }
      setJoinError(t('join.joinError'))
      setJoining(false)
    }
  }

  const next = `/join/${code}`

  return (
    <main className="grid flex-1 place-items-center bg-background px-4 py-8">
      <section className="w-full max-w-md rounded-card border border-border bg-card p-6 text-foreground shadow-panel">
        {state === 'loading' ? <LoadingState /> : null}
        {state === 'error' ? (
          <ErrorState
            message={t('join.loadError')}
            retry={() => setAttempt((value) => value + 1)}
          />
        ) : null}
        {state === 'expired' ? (
          <>
            <h1 className="mb-2 text-xl font-semibold">{t('join.title')}</h1>
            <p>{t('invite.expired')}</p>
          </>
        ) : null}
        {state === 'unknown' ? (
          <>
            <h1 className="mb-2 text-xl font-semibold">{t('join.title')}</h1>
            <p>{t('join.unknown')}</p>
          </>
        ) : null}
        {state === 'ready' && preview ? (
          <>
            <h1 className="mb-2 text-xl font-semibold">
              {t('join.invited', { trip: preview.tripName })}
            </h1>
            <p className="mb-3 text-muted">
              {t('join.by', {
                name: preview.ownerName,
                count: preview.memberCount,
              })}
            </p>
            <p className="mb-4 inline-flex min-h-8 items-center rounded-full border border-border px-3 text-sm">
              {roleName(t, preview.role)}
            </p>
            {joinError ? (
              <p role="alert" className="mb-3 text-danger">
                {joinError}
              </p>
            ) : null}
            {session.status === 'loading' ? <LoadingState /> : null}
            {session.status === 'anonymous' || session.status === 'error' ? (
              <a
                className={cn(buttonVariants(), 'bg-[#5865F2] text-white')}
                href={`/api/auth/discord?next=${encodeURIComponent(next)}`}
              >
                {t('login.continue')}
              </a>
            ) : null}
            {session.status === 'ready' ? (
              <Button disabled={joining} onClick={() => void join()}>
                {t('join.join')}
              </Button>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  )
}
