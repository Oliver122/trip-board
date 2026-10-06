import {
  normalizePlanDraft,
  planEntryErrors,
  type PlanDraft,
  type PlanEntryType,
} from '@tripboard/shared'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Dialog } from '../spots/Dialog'
import { clearedVisitCount } from './dates'

const inputClass =
  'w-full min-h-11 rounded-[8px] border border-border bg-card px-3 text-foreground'

export function EntryDialog({
  mode,
  type,
  initial,
  visits,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  mode: 'create' | 'edit'
  type: PlanEntryType
  initial: PlanDraft
  visits: { visitDate: string | null }[]
  saving: boolean
  onClose: () => void
  onSave: (draft: PlanDraft) => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const startId = useId()
  const endId = useId()
  const startTimeId = useId()
  const endTimeId = useId()
  const infoId = useId()
  const [title, setTitle] = useState(initial.title)
  const [startDate, setStartDate] = useState(initial.startDate)
  const [endDate, setEndDate] = useState(initial.endDate ?? '')
  const [startTime, setStartTime] = useState(initial.startTime ?? '')
  const [endTime, setEndTime] = useState(initial.endTime ?? '')
  const [info, setInfo] = useState(initial.info ?? '')
  const [confirming, setConfirming] = useState(false)

  const draft = normalizePlanDraft({
    type,
    title,
    startDate,
    endDate: type === 'bucket' ? endDate || null : null,
    startTime: startTime || null,
    endTime: endTime || null,
    info: info || null,
  })
  const errors = planEntryErrors(draft)
  const cleared =
    mode === 'edit' && !errors.startDate && !errors.endDate
      ? clearedVisitCount(visits, draft.startDate, draft.endDate)
      : 0
  const heading =
    mode === 'create'
      ? t(type === 'bucket' ? 'schedule.newBucket' : 'schedule.newSingle')
      : t('schedule.editEntry', { title: initial.title || t('schedule.title') })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (saving || Object.keys(errors).length > 0) return
    onSave(draft)
  }

  return (
    <Dialog title={heading} closeLabel={t('board.close')} onClose={onClose}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
          <label htmlFor={titleId} className="block">
            {t('schedule.fieldTitle')}
          </label>
          <input
            id={titleId}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
          />
          <FieldError code={errors.title} />

          <label htmlFor={startId} className="block">
            {t(type === 'bucket' ? 'schedule.startDate' : 'schedule.date')}
          </label>
          <input
            id={startId}
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className={inputClass}
          />
          <FieldError code={errors.startDate} />

          {type === 'bucket' ? (
            <>
              <label htmlFor={endId} className="block">
                {t('schedule.endDate')}
              </label>
              <input
                id={endId}
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className={inputClass}
              />
              <FieldError code={errors.endDate} />
            </>
          ) : null}

          <label htmlFor={startTimeId} className="block">
            {t('schedule.startTime')}
          </label>
          <input
            id={startTimeId}
            type="time"
            step={60}
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className={inputClass}
          />
          <FieldError code={errors.startTime} />

          <label htmlFor={endTimeId} className="block">
            {t('schedule.endTime')}
          </label>
          <input
            id={endTimeId}
            type="time"
            step={60}
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            className={inputClass}
          />
          <FieldError code={errors.endTime} />

          <label htmlFor={infoId} className="block">
            {t('schedule.info')}
          </label>
          <textarea
            id={infoId}
            rows={3}
            value={info}
            onChange={(event) => setInfo(event.target.value)}
            className={inputClass}
          />
          <FieldError code={errors.info} />

          {cleared > 0 ? (
            <p role="status" data-testid="clear-warning">
              {t('schedule.clearWarning', { count: cleared })}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          {confirming ? (
            <>
              <p>{t('schedule.confirmDelete')}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setConfirming(false)}>
                  {t('schedule.cancel')}
                </Button>
                <Button onClick={onDelete} disabled={saving}>
                  {t('schedule.delete')}
                </Button>
              </div>
            </>
          ) : (
            <>
              {mode === 'edit' && onDelete ? (
                <Button variant="outline" onClick={() => setConfirming(true)}>
                  {t('schedule.delete')}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  {t('schedule.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={saving || Object.keys(errors).length > 0}
                >
                  {t('schedule.save')}
                </Button>
              </div>
            </>
          )}
        </div>
      </form>
    </Dialog>
  )
}

function FieldError({ code }: { code?: string }) {
  const { t } = useTranslation()
  if (!code) return null
  const key = `schedule.errors.${code}`
  const message = t(key)
  if (message === key) return null
  return <p className="text-sm text-danger">{message}</p>
}
