import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { buttonVariants } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { cn } from '../lib/utils'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <main className="flex-1 overflow-auto">
      <EmptyState
        testId="not-found"
        title={t('notFound.title')}
        body={t('notFound.body')}
        action={
          <Link to="/" className={cn(buttonVariants(), 'w-full sm:w-auto')}>
            {t('notFound.home')}
          </Link>
        }
      />
    </main>
  )
}
