import {
  activeFilterCount,
  spotListSearchParams,
  type SpotListQuery,
} from '@tripboard/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buttonVariants } from '../components/ui/button'
import { Modal } from '../components/ui/modal'

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
  timeZone,
  query,
  onClose,
}: {
  tripId: string
  tripName: string
  timeZone: string
  query: SpotListQuery
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [scope, setScope] = useState<Scope>('full')
  const [format, setFormat] = useState<Format>('csv')
  const filters = activeFilterCount(query)

  const params =
    scope === 'view'
      ? spotListSearchParams({ ...query, visible: true })
      : new URLSearchParams()
  params.set('format', format)

  return (
    <Modal
      title={t('board.exportTitle', { name: tripName })}
      closeLabel={t('board.close')}
      size="sm"
      onClose={onClose}
      footer={
        <a
          className={buttonVariants({ variant: 'outline' })}
          href={`/api/trips/${tripId}/export?${params.toString()}`}
          download={exportDownloadName(tripName, timeZone, format)}
        >
          {t('board.download')}
        </a>
      }
    >
      <div className="px-4 py-4">
        <fieldset className="m-0 border-0 p-0">
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
      </div>
    </Modal>
  )
}

function exportDownloadName(
  tripName: string,
  timeZone: string,
  extension: string,
): string {
  const slug = tripName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const name = slug.length > 0 ? slug.slice(0, 80) : 'trip'
  let zone = timeZone
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date())
  } catch {
    zone = 'UTC'
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00'
  return `${name}-${pick('year')}-${pick('month')}-${pick('day')}.${extension}`
}
