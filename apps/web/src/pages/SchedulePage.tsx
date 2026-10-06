import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/states'

export function SchedulePage() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="mb-4 text-xl font-semibold">{t('schedule.title')}</h1>
      <EmptyState title={t('schedule.empty')} />
    </main>
  )
}
