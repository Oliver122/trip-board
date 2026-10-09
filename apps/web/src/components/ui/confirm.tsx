import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { buttonVariants } from './button'
import { Modal } from './modal'

export type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type Confirm = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const acceptRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback<Confirm>((opts) => {
    resolveRef.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setPending(opts)
    })
  }, [])

  const settle = (value: boolean) => {
    resolveRef.current?.(value)
    resolveRef.current = null
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <Modal
          size="sm"
          layer="top"
          title={pending.title}
          testId="confirm-dialog"
          onClose={() => settle(false)}
          initialFocus={pending.danger ? cancelRef : acceptRef}
          footer={
            <>
              <button
                ref={cancelRef}
                type="button"
                className={buttonVariants({ variant: 'outline' })}
                data-testid="confirm-cancel"
                onClick={() => settle(false)}
              >
                {pending.cancelLabel ?? t('ui.cancel')}
              </button>
              <button
                ref={acceptRef}
                type="button"
                className={buttonVariants({
                  variant: pending.danger ? 'dangerSolid' : 'default',
                })}
                data-testid="confirm-accept"
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? t('ui.confirm')}
              </button>
            </>
          }
        >
          {pending.message ? (
            <p className="px-4 py-4 text-sm">{pending.message}</p>
          ) : null}
        </Modal>
      ) : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm needs a ConfirmProvider')
  return confirm
}
