import { useTranslation } from 'react-i18next'
import { activeLocale } from '../i18n'
import type { AppLocale } from '../lib/locale'
import { cn } from '../lib/utils'
import { dateAllowed, daysInMonth, monthsCovering } from './dates'

export function VisitDatePicker({
  start,
  end,
  value,
  onChange,
  label,
}: {
  start: string
  end: string | null
  value: string | null
  onChange: (date: string) => void
  label: string
}) {
  const { i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const months = monthsCovering(start, end)

  return (
    <div role="group" aria-label={label} className="space-y-2">
      {months.map((month) => (
        <div key={month}>
          <p className="mb-1 text-sm font-semibold">
            {monthLabel(month, locale)}
          </p>
          <div className="flex flex-wrap gap-1">
            {daysInMonth(month).map((day) => {
              const allowed = dateAllowed(day, start, end)
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={day}
                  aria-pressed={value === day}
                  disabled={!allowed}
                  className={cn(
                    'inline-flex size-11 items-center justify-center rounded-[8px] border border-border text-sm',
                    value === day && 'bg-accent text-accent-foreground',
                    !allowed && 'text-muted',
                  )}
                  onClick={() => onChange(day)}
                >
                  {Number(day.slice(8, 10))}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function monthLabel(iso: string, locale: AppLocale): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  )
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
