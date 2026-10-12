import type { KindSymbol } from '@tripboard/shared'
import { useTranslation } from 'react-i18next'
import { Pin } from '../map/Pin'

/** The real map pin of one kind, updating as name, color and symbol change. */
export function KindPreview({
  name,
  color,
  symbol,
}: {
  name: string
  color: string
  symbol: KindSymbol
}) {
  const { t } = useTranslation()
  const label = name.trim() || t('kinds.previewName')
  return (
    <div
      role="group"
      aria-label={t('kinds.preview')}
      data-testid="kind-preview"
      className="flex items-center gap-3"
    >
      <span className="text-sm">{t('kinds.preview')}</span>
      <span inert className="inline-flex" data-testid="kind-preview-pin">
        <Pin category="kind" kinds={[{ color, symbol }]} label={label} />
      </span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  )
}
