import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'

export function CopyAddress({ address }: { address: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  return (
    <Button
      variant="outline"
      className="shrink-0 px-3"
      aria-label={copied ? t('board.copied') : t('board.copyAddress')}
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
      {copied ? t('board.copied') : t('board.copyAddress')}
    </Button>
  )
}
