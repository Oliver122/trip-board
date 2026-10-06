import { meResponseSchema, type MeResponse } from '@tripboard/shared'
import { useTranslation } from 'react-i18next'
import { activeLocale, chooseLocale } from './i18n'
import type { AppLocale } from './lib/locale'
import { useSession } from './session'

export function useLocaleSwitcher() {
  const { i18n } = useTranslation()
  const session = useSession()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)

  async function setLocale(next: AppLocale) {
    const previous = session.user?.locale ?? locale
    await chooseLocale(next)
    if (session.status !== 'ready' || !session.user) return
    const response = await fetch('/api/me', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    })
    if (!response.ok) {
      await chooseLocale(previous)
      return
    }
    const user = meResponseSchema.parse(await response.json())
    session.setUser(user)
  }

  return { locale, setLocale }
}

export type { MeResponse }
