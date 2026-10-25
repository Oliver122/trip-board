import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'

export function CopyAddress({
  address,
  iconOnly = false,
}: {
  address: string
  /** Phone: a 44 px icon button (R-42-18). */
  iconOnly?: boolean
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const label = copied ? t('board.copied') : t('board.copyAddress')

  return (
    <Button
      variant="outline"
      className={iconOnly ? 'size-11 shrink-0 px-0' : 'shrink-0 px-3'}
      aria-label={label}
      title={iconOnly ? label : undefined}
      onClick={() => {
        void navigator.clipboard.writeText(address).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      {iconOnly ? null : label}
    </Button>
  )
}
