import { tripSchema, type Trip } from '@tripboard/shared'
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ErrorNotice, FieldError } from '../components/notice'
import { Button } from '../components/ui/button'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { activeLocale } from '../i18n'
import { useSession } from '../session'
import { ConflictDialog, type ConflictRow } from '../live/ConflictDialog'
import { conflictOf, isAuth, isConflict, isInvalid } from '../api/http'
import { phoneQuery, useMediaQuery } from '../lib/media'
import { KindsSection } from '../kinds/KindsSection'
import { updateTrip } from '../trips/client'
import { DeleteTripDialog } from '../trips/DeleteTripDialog'
import { fieldMessage } from '../trips/fields'
import { dateRange, roleName } from '../trips/TripCard'
import { useTripData } from '../trips/trip-context'

export function TripSettingsPage() {
  const { t } = useTranslation()
  const phone = useMediaQuery(phoneQuery)
  const { reload } = useSession()
  const navigate = useNavigate()
  const { trip, setTrip } = useTripData()
  const [confirming, setConfirming] = useState(false)
  const closeDelete = useCallback(() => setConfirming(false), [])
  const showKinds = trip.role === 'admin' || trip.role === 'owner'
  useKindsAnchor(showKinds)

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
      {phone ? null : (
        <Link
          to="/trips"
          className={cn(
            hoverClass.link,
            'inline-flex min-h-11 items-center gap-1 text-sm text-muted',
          )}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t('trips.back')}
        </Link>
      )}
      <SettingsForm
        phone={phone}
        trip={trip}
        onUpdated={setTrip}
        onUnauthorized={reload}
        onDelete={() => setConfirming(true)}
        kinds={
          showKinds ? (
            phone ? (
              <p data-testid="kinds-phone-note" className="mt-8 text-muted">
                {t('phone.kindsNote')}
              </p>
            ) : (
              <KindsSection tripId={trip.id} />
            )
          ) : null
        }
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

/** `#kinds`: scroll the section into view and focus its heading, once per navigation. */
function useKindsAnchor(rendered: boolean) {
  const { hash, key } = useLocation()
  useEffect(() => {
    if (hash !== '#kinds' || !rendered) return
    let frame = 0
    let tries = 0
    // The kinds load after the first render; wait for the section to exist.
    const attempt = () => {
      const heading = document.querySelector<HTMLElement>(
        '#kinds > h2[tabindex]',
      )
      if (heading) {
        heading.scrollIntoView({ block: 'start' })
        heading.focus({ preventScroll: true })
      } else if (tries++ < 120) {
        frame = requestAnimationFrame(attempt)
      }
    }
    attempt()
    return () => cancelAnimationFrame(frame)
  }, [hash, key, rendered])
}

function tripConflictRows(
  t: (key: string) => string,
  mine: { name: string; startDate: string | null; endDate: string | null },
  theirs: Trip,
): ConflictRow[] {
  const pairs: Array<[string, string, string]> = [
    [t('trips.name'), mine.name, theirs.name],
    [t('trips.startDate'), mine.startDate ?? '', theirs.startDate ?? ''],
    [t('trips.endDate'), mine.endDate ?? '', theirs.endDate ?? ''],
  ]
  return pairs
    .filter(([, left, right]) => left !== right)
    .map(([label, left, right]) => ({ label, mine: left, theirs: right }))
}

function SettingsForm({
  phone,
  trip,
  onUpdated,
  onUnauthorized,
  onDelete,
  kinds,
}: {
  phone: boolean
  trip: Trip
  onUpdated: (trip: Trip) => void
  onUnauthorized: () => void
  onDelete: () => void
  kinds: ReactNode
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
  const [conflict, setConflict] = useState<{
    current: Trip
    updatedByName: string
    body: { name: string; startDate: string | null; endDate: string | null }
  } | null>(null)
  const canEdit = trip.role !== 'visitor'

  useEffect(() => {
    setName(trip.name)
    setStart(trip.startDate ?? '')
    setEnd(trip.endDate ?? '')
    // A live trip refresh must not wipe a settings form that is already open.
  }, [trip.id])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFields({})
    setFormError('')
    const body = {
      name,
      startDate: start || null,
      endDate: end || null,
    }
    try {
      const updated = await updateTrip(trip.id, body, trip.updatedAt)
      onUpdated(updated)
      setConflict(null)
    } catch (error) {
      if (isConflict(error)) {
        const { current, updatedBy } = conflictOf(error, tripSchema)
        setConflict({
          current,
          updatedByName: updatedBy?.name ?? '',
          body,
        })
        return
      }
      if (isAuth(error)) {
        onUnauthorized()
        return
      }
      if (isInvalid(error)) {
        setFields(error.fields)
      } else {
        setFormError(t('trips.errors.save'))
      }
    } finally {
      setSaving(false)
    }
  }

  async function useMine() {
    if (!conflict) return
    setSaving(true)
    try {
      const updated = await updateTrip(trip.id, conflict.body)
      onUpdated(updated)
      setConflict(null)
    } catch (error) {
      if (isAuth(error)) {
        onUnauthorized()
        return
      }
      setFormError(t('trips.errors.save'))
    } finally {
      setSaving(false)
    }
  }

  function useTheirs() {
    if (!conflict) return
    setName(conflict.current.name)
    setStart(conflict.current.startDate ?? '')
    setEnd(conflict.current.endDate ?? '')
    onUpdated(conflict.current)
    setConflict(null)
  }

  const nameError = fields.name ? fieldMessage(t, fields.name) : ''
  const endError = fields.endDate ? fieldMessage(t, fields.endDate) : ''

  return (
    <>
      {phone ? (
        <h1 className="sr-only">{trip.name}</h1>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{trip.name}</h1>
          <span className="rounded-full border border-border bg-card px-2 py-0.5 text-xs leading-4 text-foreground">
            {roleName(t, trip.role)}
          </span>
        </div>
      )}
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
            <ErrorNotice className="mb-3">{formError}</ErrorNotice>
          ) : null}
          <label htmlFor="trip-settings-name" className="mb-1 block">
            {t('trips.name')}
          </label>
          <FieldError message={nameError}>
            <input
              id="trip-settings-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
            />
          </FieldError>
          <label htmlFor="trip-settings-start" className="mb-1 mt-3 block">
            {t('trips.startDate')}
          </label>
          <input
            id="trip-settings-start"
            type="date"
            lang={locale}
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
          />
          <label htmlFor="trip-settings-end" className="mb-1 mt-3 block">
            {t('trips.endDate')}
          </label>
          <FieldError message={endError}>
            <input
              id="trip-settings-end"
              type="date"
              lang={locale}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
            />
          </FieldError>
          <Button className="mt-4" type="submit" disabled={saving}>
            {t('trips.save')}
          </Button>
        </form>
      ) : null}
      {conflict ? (
        <ConflictDialog
          name={conflict.updatedByName}
          titleKey="live.conflictSaved"
          rows={tripConflictRows(t, conflict.body, conflict.current)}
          onMine={() => {
            void useMine()
          }}
          onTheirs={useTheirs}
        />
      ) : null}
      {kinds}
      {trip.role === 'owner' ? (
        <div className="mt-8">
          <Button variant="danger" onClick={onDelete}>
            {t('trips.delete')}
          </Button>
        </div>
      ) : null}
    </>
  )
}
