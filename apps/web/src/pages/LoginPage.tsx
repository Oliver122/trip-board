import { safeNextPath } from '@tripboard/shared'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from '../components/Preferences'
import { ErrorNotice } from '../components/notice'
import { buttonVariants } from '../components/ui/button'

export function LoginPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const message = loginError(t, params.get('error'), params.get('reason'))

  return (
    <main className="mx-auto max-w-md px-4 py-8 md:px-8">
      <div className="mb-4">
        <LanguageSwitch />
      </div>
      <h1 className="mb-4 text-xl font-semibold">{t('login.title')}</h1>
      {message ? (
        <ErrorNotice testId="login-error" className="mb-4">
          {message}
        </ErrorNotice>
      ) : null}
      <a
        className={buttonVariants()}
        href={`/api/auth/discord?next=${encodeURIComponent(next)}`}
      >
        {t('login.continue')}
      </a>
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
