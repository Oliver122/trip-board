import { searchRegions, type KnownRegion, type Trip } from '@tripboard/shared'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorNotice, FieldError } from '../components/notice'
import { Button } from '../components/ui/button'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { ApiError, AuthError, createTrip } from './client'
import { fieldMessage } from './fields'

const inputClass =
  'w-full min-h-11 rounded-[8px] border border-border bg-card px-3 text-foreground'

export function CreateTripDialog({
  open,
  onClose,
  onCreated,
  onUnauthorized,
}: {
  open: boolean
  onClose: () => void
  onCreated: (trip: Trip) => void
  onUnauthorized: () => void
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const listId = useId()
  const nameId = useId()
  const regionId = useId()
  const zoneId = useId()
  const startId = useId()
  const endId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  const [browserZone] = useState(browserTimeZone)
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<KnownRegion | null>(null)
  const [timezone, setTimezone] = useState(browserZone)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setName('')
    setQuery('')
    setSelected(null)
    setTimezone(browserZone)
    setStart('')
    setEnd('')
    setFields({})
    setFormError('')
    setSaving(false)
    nameRef.current?.focus()
  }, [open, browserZone])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const results =
    selected && selected.label === query.trim() ? [] : searchRegions(query)
  const nameError = fields.name ? fieldMessage(t, fields.name) : ''
  const regionCode = fields.region ?? fields['region.bbox']
  const regionError = regionCode ? fieldMessage(t, regionCode) : ''
  const startError = fields.startDate ? fieldMessage(t, fields.startDate) : ''
  const endError = fields.endDate ? fieldMessage(t, fields.endDate) : ''
  const zoneError = fields.timezone ? fieldMessage(t, fields.timezone) : ''

  function onQuery(value: string) {
    setQuery(value)
    if (selected && selected.label !== value.trim()) {
      setSelected(null)
      setTimezone(browserZone)
    }
  }

  function pick(region: KnownRegion) {
    setSelected(region)
    setQuery(region.label)
    setTimezone(region.timezone)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (name.trim().length === 0) next.name = 'empty'
    if (!selected) next.region = 'required'
    if (start && end && end < start) next.endDate = 'before_start'
    if (Object.keys(next).length > 0) {
      setFields(next)
      setFormError('')
      return
    }
    if (!selected) return
    setSaving(true)
    setFields({})
    setFormError('')
    try {
      const trip = await createTrip({
        name: name.trim(),
        timezone,
        startDate: start || null,
        endDate: end || null,
        region: { bbox: selected.bbox },
      })
      if (!alive.current) return
      onCreated(trip)
    } catch (error) {
      if (!alive.current) return
      if (error instanceof AuthError) {
        onUnauthorized()
        return
      }
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setFields(error.fields)
      } else {
        setFormError(t('trips.errors.save'))
      }
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-foreground/40 p-4 max-sm:p-0"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-md overflow-auto rounded-card bg-card p-6 text-foreground shadow-panel max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="mb-4 text-lg font-semibold">
          {t('trips.createTitle')}
        </h2>
        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          {formError ? (
            <ErrorNotice className="mb-3">{formError}</ErrorNotice>
          ) : null}
          <label htmlFor={nameId} className="mb-1 block">
            {t('trips.name')}
          </label>
          <FieldError message={nameError}>
            <input
              id={nameId}
              ref={nameRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </FieldError>
          <label htmlFor={regionId} className="mb-1 mt-3 block">
            {t('trips.region')}
          </label>
          <FieldError message={regionError}>
            <input
              id={regionId}
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={results.length > 0 ? listId : undefined}
              aria-autocomplete="list"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              className={inputClass}
            />
          </FieldError>
          {results.length > 0 ? (
            <ul
              id={listId}
              role="listbox"
              className="mt-1 max-h-48 overflow-auto rounded-[8px] border border-border p-1"
            >
              {results.map((region) => (
                <li key={region.label} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected?.label === region.label}
                    className={cn(
                      hoverClass.item,
                      'min-h-11 w-full rounded-[8px] px-3 text-left',
                      selected?.label === region.label && 'bg-hover',
                    )}
                    onClick={() => pick(region)}
                  >
                    {region.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label htmlFor={zoneId} className="mb-1 mt-3 block">
            {t('trips.timezone')}
          </label>
          <FieldError message={zoneError}>
            <input
              id={zoneId}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className={inputClass}
            />
          </FieldError>
          <label htmlFor={startId} className="mb-1 mt-3 block">
            {t('trips.startDate')}
          </label>
          <FieldError message={startError}>
            <input
              id={startId}
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className={inputClass}
            />
          </FieldError>
          <label htmlFor={endId} className="mb-1 mt-3 block">
            {t('trips.endDate')}
          </label>
          <FieldError message={endError}>
            <input
              id={endId}
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className={inputClass}
            />
          </FieldError>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('trips.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {t('trips.createSubmit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function DialogFrame({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-foreground/40 p-4 max-sm:p-0"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-md overflow-auto rounded-card bg-card p-6 text-foreground shadow-panel max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="mb-4 text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
