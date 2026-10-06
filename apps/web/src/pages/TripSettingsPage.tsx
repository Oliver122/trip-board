import type { Trip } from '@tripboard/shared'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { activeLocale } from '../i18n'
import { useSession } from '../session'
import { ApiError, AuthError, updateTrip } from '../trips/client'
import { DeleteTripDialog } from '../trips/DeleteTripDialog'
import { fieldMessage } from '../trips/fields'
import { dateRange, roleName } from '../trips/TripCard'
import { useTripData } from '../trips/trip-context'

export function TripSettingsPage() {
  const { t } = useTranslation()
  const { reload } = useSession()
  const navigate = useNavigate()
  const { trip, setTrip } = useTripData()
  const [confirming, setConfirming] = useState(false)
  const closeDelete = useCallback(() => setConfirming(false), [])

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 md:px-8">
      <Link to="/trips" className="text-sm text-muted">
        {t('trips.back')}
      </Link>
      <SettingsForm
        trip={trip}
        onUpdated={setTrip}
        onUnauthorized={reload}
        onDelete={() => setConfirming(true)}
      />
      <DeleteTripDialog
        trip={confirming ? trip : null}
        onClose={closeDelete}
        onUnauthorized={reload}
        onDeleted={() => navigate('/trips')}
      />
    </main>
  )
}

function SettingsForm({
  trip,
  onUpdated,
  onUnauthorized,
  onDelete,
}: {
  trip: Trip
  onUpdated: (trip: Trip) => void
  onUnauthorized: () => void
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = activeLocale(i18n.resolvedLanguage ?? i18n.language)
  const dates = dateRange(trip.startDate, trip.endDate, locale)
  const [name, setName] = useState(trip.name)
  const [start, setStart] = useState(trip.startDate ?? '')
  const [end, setEnd] = useState(trip.endDate ?? '')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const canEdit = trip.role !== 'visitor'

  useEffect(() => {
    setName(trip.name)
    setStart(trip.startDate ?? '')
    setEnd(trip.endDate ?? '')
  }, [trip])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFields({})
    setFormError('')
    try {
      const updated = await updateTrip(trip.id, {
        name,
        startDate: start || null,
        endDate: end || null,
      })
      onUpdated(updated)
    } catch (error) {
      if (error instanceof AuthError) {
        onUnauthorized()
        return
      }
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setFields(error.fields)
      } else {
        setFormError(t('trips.errors.save'))
      }
    } finally {
      setSaving(false)
    }
  }

  const nameError = fields.name ? fieldMessage(t, fields.name) : ''
  const endError = fields.endDate ? fieldMessage(t, fields.endDate) : ''

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{trip.name}</h1>
        <span className="rounded-full bg-card px-2 py-0.5 text-xs">
          {roleName(t, trip.role)}
        </span>
      </div>
      {dates ? <p className="mt-2 text-muted">{dates}</p> : null}
      {canEdit ? (
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="mt-8"
          noValidate
        >
          <h2 className="mb-3 text-base font-semibold">
            {t('trips.settings')}
          </h2>
          {formError ? (
            <p role="alert" className="mb-3 text-danger">
              {formError}
            </p>
          ) : null}
          <label htmlFor="trip-settings-name" className="mb-1 block">
            {t('trips.name')}
          </label>
          <input
            id="trip-settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
            aria-invalid={nameError ? true : undefined}
          />
          {nameError ? (
            <p role="alert" className="mt-1 text-danger">
              {nameError}
            </p>
          ) : null}
          <label htmlFor="trip-settings-start" className="mb-1 mt-3 block">
            {t('trips.startDate')}
          </label>
          <input
            id="trip-settings-start"
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
          />
          <label htmlFor="trip-settings-end" className="mb-1 mt-3 block">
            {t('trips.endDate')}
          </label>
          <input
            id="trip-settings-end"
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
            aria-invalid={endError ? true : undefined}
          />
          {endError ? (
            <p role="alert" className="mt-1 text-danger">
              {endError}
            </p>
          ) : null}
          <Button className="mt-4" type="submit" disabled={saving}>
            {t('trips.save')}
          </Button>
        </form>
      ) : null}
      {trip.role === 'owner' ? (
        <div className="mt-8">
          <Button variant="outline" onClick={onDelete}>
            {t('trips.delete')}
          </Button>
        </div>
      ) : null}
    </>
  )
}
