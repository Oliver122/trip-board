import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'

export function JoinPage() {
  const { t } = useTranslation()
  const { code } = useParams()
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="mb-2 text-xl font-semibold">{t('join.title')}</h1>
      <p className="text-muted">{t('join.body')}</p>
      <p className="mt-4 font-semibold">{code}</p>
    </main>
  )
}
