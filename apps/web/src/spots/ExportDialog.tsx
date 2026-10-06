import {
  activeFilterCount,
  spotListSearchParams,
  type SpotListQuery,
} from '@tripboard/shared'
import { X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buttonVariants } from '../components/ui/button'

type Scope = 'full' | 'view'
type Format = 'csv' | 'pdf' | 'ics'

const formats = [
  ['csv', 'board.exportCsv'],
  ['pdf', 'board.exportPdf'],
  ['ics', 'board.exportCalendar'],
] as const

export function ExportDialog({
  tripId,
  tripName,
  query,
  onClose,
}: {
  tripId: string
  tripName: string
  query: SpotListQuery
  onClose: () => void
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const [scope, setScope] = useState<Scope>('full')
  const [format, setFormat] = useState<Format>('csv')
  const filters = activeFilterCount(query)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const params =
    scope === 'view'
      ? spotListSearchParams({ ...query, visible: true })
      : new URLSearchParams()
  params.set('format', format)

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-foreground/40 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-card bg-card p-6 text-foreground shadow-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="pr-10 text-lg font-semibold">
          {t('board.exportTitle', { name: tripName })}
        </h2>
        <button
          type="button"
          className="absolute right-4 top-4 inline-flex size-11 items-center justify-center rounded-[8px]"
          aria-label={t('board.close')}
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
        <fieldset className="m-0 mt-4 border-0 p-0">
          <legend className="mb-2 text-sm font-semibold">
            {t('board.exportScope')}
          </legend>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="export-scope"
              checked={scope === 'full'}
              onChange={() => setScope('full')}
            />
            {t('board.exportFull')}
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="export-scope"
              checked={scope === 'view'}
              onChange={() => setScope('view')}
            />
            {t('board.exportView', { count: filters })}
          </label>
        </fieldset>
        <fieldset className="m-0 mt-3 border-0 p-0">
          <legend className="mb-2 text-sm font-semibold">
            {t('board.exportFormat')}
          </legend>
          {formats.map(([value, key]) => (
            <label key={value} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="export-format"
                checked={format === value}
                onChange={() => setFormat(value)}
              />
              {t(key)}
            </label>
          ))}
        </fieldset>
        <div className="mt-4 flex justify-end">
          <a
            className={buttonVariants()}
            href={`/api/trips/${tripId}/export?${params.toString()}`}
          >
            {t('board.download')}
          </a>
        </div>
      </div>
    </div>
  )
}
