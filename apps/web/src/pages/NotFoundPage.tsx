import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="mb-2 text-xl font-semibold">{t('notFound.title')}</h1>
      <p className="mb-4 text-muted">{t('notFound.body')}</p>
      <Link to="/" className={cn(hoverClass.link, 'underline')}>
        {t('notFound.home')}
      </Link>
    </main>
  )
}
