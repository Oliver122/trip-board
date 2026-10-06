import { useTranslation } from 'react-i18next'
import { ErrorNotice } from './notice'
import { Button } from './ui/button'

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation()
  return (
    <p role="status" className="text-muted">
      {label ?? t('state.loading')}
    </p>
  )
}

export function EmptyState({
  title,
  description,
}: {
  title?: string
  description?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-card border border-border bg-card px-4 py-8 text-center shadow-panel">
      <p className="font-semibold">{title ?? t('state.empty')}</p>
      {description ? <p className="mt-1 text-muted">{description}</p> : null}
    </div>
  )
}

export function ErrorState({
  message,
  retry,
}: {
  message?: string
  retry?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <ErrorNotice>{message ?? t('state.error')}</ErrorNotice>
      {retry ? (
        <Button className="mt-3" onClick={retry}>
          {t('state.retry')}
        </Button>
      ) : null}
    </div>
  )
}
