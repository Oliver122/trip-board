import { CircleAlert, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { hoverClass } from './ui/hover'
import { cn } from '../lib/utils'

export type ToastMessage = {
  message: string
  kind: 'info' | 'error'
}

export function Toast({
  toast,
  onClose,
}: {
  toast: ToastMessage
  onClose: () => void
}) {
  const { t } = useTranslation()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const error = toast.kind === 'error'

  useEffect(() => {
    const timer = window.setTimeout(
      () => onCloseRef.current(),
      error ? 6000 : 4000,
    )
    return () => window.clearTimeout(timer)
  }, [error, toast.message])

  return (
    <div
      role={error ? 'alert' : 'status'}
      data-testid="toast"
      data-kind={toast.kind}
      className={cn(
        'fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-card px-4 py-3 shadow-panel',
        error ? 'bg-danger-solid text-white' : 'bg-foreground text-background',
      )}
    >
      {error ? (
        <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      ) : null}
      <p className="m-0">{toast.message}</p>
      {error ? (
        <button
          type="button"
          className={cn(
            hoverClass.ghost,
            'size-8 shrink-0 rounded-[8px] text-white hover:text-white',
          )}
          aria-label={t('toast.close')}
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  )
}
