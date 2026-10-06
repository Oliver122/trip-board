import type { PlanEntry, SpotPlan } from '@tripboard/shared'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { activeLocale } from '../i18n'
import { formatDate } from '../lib/format'
import { VisitDatePicker } from '../plan/VisitDatePicker'

const inputClass =
  'mt-1 w-full min-h-11 rounded-[8px] border border-border bg-card px-3 font-normal'

export function InPlans({
  plans,
  entries,
  canEdit,
  onAdd,
  onRemove,
}: {
  plans: SpotPlan[]
  entries: PlanEntry[]
  canEdit: boolean
  onAdd: (input: {
    entryId: string
    visitDate: string | null
    visitTime: string | null
  }) => Promise<void>
  onRemove: (entryId: string, linkId: string) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const entryId = useId()
  const timeId = useId()
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState('')
  const [visitDate, setVisitDate] = useState<string | null>(null)
  const [visitTime, setVisitTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const entry = entries.find((item) => item.id === chosen) ?? null

  async function submit() {
    if (!entry || saving) return
    setSaving(true)
    setFailed(false)
    try {
      const date = entry.type === 'single' ? entry.startDate : visitDate
      await onAdd({
        entryId: entry.id,
        visitDate: date,
        visitTime: visitTime.trim() === '' ? null : visitTime,
      })
      setOpen(false)
      setChosen('')
      setVisitDate(null)
      setVisitTime('')
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label={t('board.inPlans')} className="space-y-2">
      <h3 className="text-sm font-semibold">{t('board.inPlans')}</h3>
      {plans.length === 0 ? (
        <p className="text-sm text-muted">{t('board.noPlans')}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {plans.map((plan) => {
            const when = planWhen(plan, locale)
            return (
              <li
                key={plan.linkId}
                className="flex items-center justify-between gap-2"
              >
                <span>
                  {when
                    ? t('board.planLine', { entry: plan.title, when })
                    : plan.title}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="inline-flex size-11 items-center justify-center rounded-[8px]"
                    aria-label={t('board.removeFromPlan', {
                      entry: plan.title,
                    })}
                    onClick={() => {
                      void onRemove(plan.entryId, plan.linkId)
                    }}
                  >
                    {t('schedule.remove')}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      {canEdit ? (
        open ? (
          <div
            className="space-y-2"
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault()
            }}
          >
            <label htmlFor={entryId} className="block text-sm font-semibold">
              {t('board.planEntry')}
              <select
                id={entryId}
                className={inputClass}
                value={chosen}
                onChange={(event) => {
                  setChosen(event.target.value)
                  setVisitDate(null)
                }}
              >
                <option value="">{t('board.chooseEntry')}</option>
                {entries.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            {entry && entry.type === 'bucket' ? (
              <VisitDatePicker
                start={entry.startDate}
                end={entry.endDate}
                value={visitDate}
                onChange={setVisitDate}
                label={t('schedule.visitDate')}
              />
            ) : null}
            {entry ? (
              <>
                <label htmlFor={timeId} className="block text-sm font-semibold">
                  {t('schedule.visitTime')}
                </label>
                <input
                  id={timeId}
                  type="time"
                  step={60}
                  value={visitTime}
                  onChange={(event) => setVisitTime(event.target.value)}
                  className={inputClass}
                />
              </>
            ) : null}
            {failed ? (
              <p role="alert" className="text-sm text-danger">
                {t('schedule.saveError')}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t('schedule.cancel')}
              </Button>
              <Button
                type="button"
                disabled={!entry || saving}
                onClick={() => {
                  void submit()
                }}
              >
                {t('schedule.addVisit')}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setOpen(true)}>
            {t('board.addToPlan')}
          </Button>
        )
      ) : null}
    </section>
  )
}

function planWhen(
  plan: SpotPlan,
  locale: ReturnType<typeof activeLocale>,
): string {
  if (!plan.visitDate) return ''
  const date = formatDate(plan.visitDate, locale)
  return plan.visitTime ? `${date} ${plan.visitTime}` : date
}
