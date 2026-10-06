import { healthResponseSchema, type HealthResponse } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function HomePage() {
  const { t } = useTranslation()
  const [health, setHealth] = useState<HealthResponse | 'error'>('error')

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (controller.signal.aborted) return
        try {
          const response = await fetch('/api/health', {
            signal: controller.signal,
          })
          const parsed = healthResponseSchema.parse(await response.json())
          setHealth(parsed)
          return
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      }
      if (!controller.signal.aborted) setHealth('error')
    }
    void load()
    return () => controller.abort()
  }, [])

  const label =
    health === 'error'
      ? t('home.healthUnreachable')
      : health.db === 'ok'
        ? t('home.healthOk')
        : t('home.healthDown')

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="mb-2 text-xl font-semibold">{t('appName')}</h1>
      <p className="text-muted">{t('home.placeholder')}</p>
      <p className="mt-4" data-testid="health">
        {label}
      </p>
    </main>
  )
}
