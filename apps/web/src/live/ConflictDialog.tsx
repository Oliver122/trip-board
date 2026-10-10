import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Modal } from '../components/ui/modal'

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
    <Modal
      title={t(titleKey, { name: actor })}
      layer="top"
      size="md"
      dismissible={false}
      testId="conflict-dialog"
      onClose={onTheirs}
      footer={
        <>
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
        </>
      }
    >
      <ul className="space-y-2 px-4 py-4 text-sm">
        {rows.map((row) => (
          <li key={row.label}>
            <p className="font-medium">{row.label}</p>
            <p>{t('live.mine', { value: row.mine || t('live.blank') })}</p>
            <p>{t('live.theirs', { value: row.theirs || t('live.blank') })}</p>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
