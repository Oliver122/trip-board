import {
  normalizePlanDraft,
  planEntryErrors,
  type PlanDraft,
  type PlanEntryType,
} from '@tripboard/shared'
import { Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldError } from '../components/notice'
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
  const deleteRef = useRef<HTMLDivElement>(null)
  const refocusDelete = useRef(false)

  useEffect(() => {
    if (!confirming && refocusDelete.current) {
      refocusDelete.current = false
      deleteRef.current
        ?.querySelector<HTMLButtonElement>('[data-testid="entry-delete"]')
        ?.focus()
    }
  }, [confirming])

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
        <div className="min-h-0 flex-1 space-y-3 overflow-auto overscroll-contain px-4 py-4">
          <label htmlFor={titleId} className="block">
            {t('schedule.fieldTitle')}
          </label>
          <FieldError message={fieldText(t, errors.title)}>
            <input
              id={titleId}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={inputClass}
            />
          </FieldError>

          <label htmlFor={startId} className="block">
            {t(type === 'bucket' ? 'schedule.startDate' : 'schedule.date')}
          </label>
          <FieldError message={fieldText(t, errors.startDate)}>
            <TypedDateInput
              id={startId}
              value={startDate}
              onChange={setStartDate}
              className={inputClass}
            />
          </FieldError>

          {type === 'bucket' ? (
            <>
              <label htmlFor={endId} className="block">
                {t('schedule.endDate')}
              </label>
              <FieldError message={fieldText(t, errors.endDate)}>
                <TypedDateInput
                  id={endId}
                  value={endDate}
                  onChange={setEndDate}
                  className={inputClass}
                />
              </FieldError>
            </>
          ) : null}

          <label htmlFor={startTimeId} className="block">
            {t('schedule.startTime')}
          </label>
          <FieldError message={fieldText(t, errors.startTime)}>
            <input
              id={startTimeId}
              type="time"
              step={60}
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={inputClass}
            />
          </FieldError>

          <label htmlFor={endTimeId} className="block">
            {t('schedule.endTime')}
          </label>
          <FieldError message={fieldText(t, errors.endTime)}>
            <input
              id={endTimeId}
              type="time"
              step={60}
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={inputClass}
            />
          </FieldError>

          <label htmlFor={infoId} className="block">
            {t('schedule.info')}
          </label>
          <FieldError message={fieldText(t, errors.info)}>
            <textarea
              id={infoId}
              rows={3}
              value={info}
              onChange={(event) => setInfo(event.target.value)}
              className={inputClass}
            />
          </FieldError>

          {cleared > 0 ? (
            <p role="status" data-testid="clear-warning">
              {t('schedule.clearWarning', { count: cleared })}
            </p>
          ) : null}
        </div>
        <div ref={deleteRef} className="border-t border-border px-4 py-3">
          {confirming ? (
            <div
              data-testid="entry-delete-confirm"
              className="flex flex-wrap items-center justify-end gap-2"
            >
              <p className="min-w-0 basis-full">
                {t('schedule.confirmDelete')}
              </p>
              <Button
                variant="outline"
                className="whitespace-nowrap"
                onClick={() => {
                  refocusDelete.current = true
                  setConfirming(false)
                }}
              >
                {t('schedule.cancel')}
              </Button>
              <Button
                variant="dangerSolid"
                className="whitespace-nowrap"
                onClick={onDelete}
                disabled={saving}
              >
                <Trash2 aria-hidden="true" className="size-4" />
                {t('schedule.delete')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {mode === 'edit' && onDelete ? (
                <Button
                  variant="danger"
                  size="icon"
                  aria-label={t('schedule.deleteEntry')}
                  title={t('schedule.deleteEntry')}
                  data-testid="entry-delete"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="whitespace-nowrap"
                  onClick={onClose}
                >
                  {t('schedule.cancel')}
                </Button>
                <Button
                  type="submit"
                  className="whitespace-nowrap"
                  disabled={saving || Object.keys(errors).length > 0}
                >
                  {t('schedule.save')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </form>
    </Dialog>
  )
}

function TypedDateInput({
  id,
  value,
  onChange,
  className,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  className: string
}) {
  const digits = useRef(isoToMonthDayYear(value))
  const ref = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const input = ref.current
    if (!input) return
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Backspace') {
        event.preventDefault()
        event.stopPropagation()
        digits.current = digits.current.slice(0, -1)
        onChangeRef.current(monthDayYearToIso(digits.current))
        return
      }
      if (!/^\d$/.test(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      digits.current = (digits.current + event.key).slice(-8)
      onChangeRef.current(monthDayYearToIso(digits.current))
    }
    input.addEventListener('keydown', onKey, true)
    return () => input.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <input
      ref={ref}
      id={id}
      type="date"
      value={value}
      onChange={(event) => {
        digits.current = isoToMonthDayYear(event.target.value)
        onChange(event.target.value)
      }}
      className={className}
    />
  )
}

function isoToMonthDayYear(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return match ? `${match[2]}${match[3]}${match[1]}` : ''
}

function monthDayYearToIso(digits: string): string {
  if (digits.length < 8) return ''
  return `${digits.slice(4, 8)}-${digits.slice(0, 2)}-${digits.slice(2, 4)}`
}

function fieldText(t: (key: string) => string, code?: string): string | null {
  if (!code) return null
  const key = `schedule.errors.${code}`
  const message = t(key)
  return message === key ? null : message
}
