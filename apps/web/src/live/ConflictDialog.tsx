import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'

export type ConflictRow = {
  label: string
  mine: string
  theirs: string
}

export function ConflictDialog({
  name,
  rows,
  onMine,
  onTheirs,
  titleKey = 'live.conflictTitle',
}: {
  name: string
  rows: ConflictRow[]
  onMine: () => void
  onTheirs: () => void
  titleKey?: 'live.conflictTitle' | 'live.conflictSaved'
}) {
  const { t } = useTranslation()
  const actor = name || t('live.someone')
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
      data-testid="conflict-dialog"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-lg rounded-[8px] border border-border bg-background p-4 shadow-panel">
        <h2 id="conflict-title" className="text-lg font-semibold">
          {t(titleKey, { name: actor })}
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.label}>
              <p className="font-medium">{row.label}</p>
              <p>{t('live.mine', { value: row.mine || t('live.blank') })}</p>
              <p>
                {t('live.theirs', { value: row.theirs || t('live.blank') })}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" data-testid="conflict-mine" onClick={onMine}>
            {t('live.useMine')}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="conflict-theirs"
            onClick={onTheirs}
          >
            {t('live.useTheirs')}
          </Button>
        </div>
      </div>
    </div>
  )
}
