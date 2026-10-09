import type { Trip } from '@tripboard/shared'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldError } from '../components/notice'
import { Button } from '../components/ui/button'
import { isAuth } from '../api/http'
import { deleteTrip } from './client'
import { Modal } from '../components/ui/modal'

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
  const formId = useId()
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
      if (isAuth(caught)) {
        onUnauthorized()
        return
      }
      setError(t('trips.errors.save'))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('trips.delete')}
      size="md"
      onClose={onClose}
      initialFocus={inputRef}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('trips.cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="dangerSolid"
            disabled={!matches || saving}
          >
            {t('trips.delete')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="p-4"
        onSubmit={(event) => void onSubmit(event)}
      >
        <label htmlFor={inputId} className="mb-1 block">
          {t('trips.confirmName')}
        </label>
        <FieldError message={error}>
          <input
            id={inputId}
            ref={inputRef}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className="w-full min-h-11 rounded-[8px] border border-border bg-card px-3"
            autoComplete="off"
          />
        </FieldError>
      </form>
    </Modal>
  )
}
