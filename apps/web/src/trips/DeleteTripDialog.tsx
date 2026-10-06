import type { Trip } from '@tripboard/shared'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { AuthError, deleteTrip } from './client'
import { DialogFrame } from './CreateTripDialog'

export function DeleteTripDialog({
  trip,
  onClose,
  onDeleted,
  onUnauthorized,
}: {
  trip: Trip | null
  onClose: () => void
  onDeleted: () => void
  onUnauthorized: () => void
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!trip) return
    setTyped('')
    setError('')
    setSaving(false)
    inputRef.current?.focus()
  }, [trip])

  if (!trip) return null

  const matches = typed === trip.name

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!trip || typed !== trip.name) return
    setSaving(true)
    setError('')
    try {
      await deleteTrip(trip.id)
      if (!alive.current) return
      onDeleted()
    } catch (caught) {
      if (!alive.current) return
      if (caught instanceof AuthError) {
        onUnauthorized()
        return
      }
      setError(t('trips.errors.save'))
      setSaving(false)
    }
  }

  return (
    <DialogFrame title={t('trips.delete')} onClose={onClose}>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label htmlFor={inputId} className="mb-1 block">
          {t('trips.confirmName')}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className="w-full min-h-11 rounded-[8px] border border-border bg-card px-3"
          autoComplete="off"
        />
        {error ? (
          <p role="alert" className="mt-1 text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('trips.cancel')}
          </Button>
          <Button type="submit" disabled={!matches || saving}>
            {t('trips.delete')}
          </Button>
        </div>
      </form>
    </DialogFrame>
  )
}
