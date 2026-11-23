import type { PlanEntry, PlanLink } from '@tripboard/shared'
import { useTranslation } from 'react-i18next'
import { Modal } from '../components/ui/modal'
import { hoverClass } from '../components/ui/hover'
import type { AppLocale } from '../lib/locale'
import { cn } from '../lib/utils'
import { entryDates } from './day-groups'
import { formatDayLabel } from './plan-scene'

/** R-46-04: every entry with its days and *Any day*; the current place is disabled. */
export function MoveDialog({
  entries,
  fromEntryId,
  link,
  locale,
  onPick,
  onClose,
}: {
  entries: PlanEntry[]
  fromEntryId: string
  link: PlanLink
  locale: AppLocale
  onPick: (entryId: string, visitDate: string | null) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Modal
      testId="move-dialog"
      size="sm"
      title={t('schedule.moveTitle', { spot: link.title })}
      closeLabel={t('board.close')}
      onClose={onClose}
    >
      <div className="max-h-[70vh] space-y-4 overflow-auto px-4 py-4">
        {entries.map((entry) => {
          const options: { date: string | null; label: string }[] = [
            ...entryDates(entry).map((date) => ({
              date,
              label: formatDayLabel(date, locale),
            })),
            { date: null, label: t('schedule.anyDay') },
          ]
          return (
            <section key={entry.id}>
              <h3 className="mb-1 font-semibold">{entry.title}</h3>
              <ul className="m-0 list-none p-0">
                {options.map((option) => {
                  const current =
                    entry.id === fromEntryId && option.date === link.visitDate
                  return (
                    <li key={option.date ?? 'any'}>
                      <button
                        type="button"
                        data-testid={`move-option-${entry.id}-${option.date ?? 'any'}`}
                        disabled={current}
                        aria-current={current ? 'true' : undefined}
                        className={cn(
                          hoverClass.item,
                          'flex min-h-11 w-full items-center justify-between gap-2 rounded-[8px] px-3 text-left disabled:opacity-60',
                        )}
                        onClick={() => onPick(entry.id, option.date)}
                      >
                        <span>{option.label}</span>
                        {current ? (
                          <span className="text-sm text-muted">
                            {t('schedule.moveCurrent')}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
