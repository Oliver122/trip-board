import { safeNextPath } from '@tripboard/shared'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from '../components/Preferences'
import { ErrorNotice } from '../components/notice'
import { Button, buttonVariants } from '../components/ui/button'
import { useDevLogin } from '../dev-login'
import { cn } from '../lib/utils'

export function LoginPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const message = loginError(t, params.get('error'), params.get('reason'))
  const devLogin = useDevLogin()
  const [failed, setFailed] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function signIn(discordId: string) {
    setFailed(false)
    setPendingId(discordId)
    try {
      const response = await fetch('/api/auth/dev/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ discordId }),
      })
      if (!response.ok) {
        setFailed(true)
        return
      }
      window.location.assign(next)
    } catch {
      setFailed(true)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-[432px] px-4 py-8">
      <div className="mb-4 flex justify-end">
        <LanguageSwitch />
      </div>
      <h1 className="mb-4 text-xl font-semibold">{t('login.title')}</h1>
      {message ? (
        <ErrorNotice testId="login-error" className="mb-4">
          {message}
        </ErrorNotice>
      ) : null}
      <a
        className={cn(buttonVariants(), 'w-full')}
        href={`/api/auth/discord?next=${encodeURIComponent(next)}`}
      >
        {t('login.continue')}
      </a>
      {devLogin.status === 'on' ? (
        <section className="mt-8" aria-labelledby="dev-login-title">
          <h2 id="dev-login-title" className="mb-3 text-sm font-semibold">
            {t('login.devTitle')}
          </h2>
          {devLogin.users.length === 0 ? (
            <p className="text-muted">{t('login.devEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {devLogin.users.map((user) => {
                const name = user.displayName ?? user.username
                return (
                  <li key={user.discordId}>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={pendingId !== null}
                      onClick={() => {
                        void signIn(user.discordId)
                      }}
                    >
                      {user.appRole === 'admin'
                        ? t('login.devAdmin', { name })
                        : name}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          {failed ? (
            <ErrorNotice testId="dev-login-error" className="mt-3">
              {t('login.devFailed')}
            </ErrorNotice>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}

function loginError(
  t: (key: string, options?: Record<string, string>) => string,
  error: string | null,
  reason: string | null,
): string | null {
  if (error === 'access_denied') return t('login.cancelled')
  if (error === 'suspended') {
    return t('login.suspended', {
      reason: (reason ?? '').slice(0, 500),
    })
  }
  if (error === 'signups_disabled') return t('login.signupsDisabled')
  if (error === 'discord_unavailable') return t('login.discordDown')
  if (error) return t('login.generic')
  return null
}
