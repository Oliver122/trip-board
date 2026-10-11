import type { AppSettings } from '@tripboard/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorState, LoadingState } from '../components/states'
import { ErrorNotice } from '../components/notice'
import { Button } from '../components/ui/button'
import { megabytes } from '../images/format'
import { useCapacityRefresh } from './AdminLayout'
import { bytesFromMb, getSettings, saveSettings } from './client'

export function SettingsPage() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [error, setError] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const refreshCapacity = useCapacityRefresh()

  useEffect(() => {
    const controller = new AbortController()
    void getSettings(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setSettings(next)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [])

  if (error) return <ErrorState />
  if (!settings) return <LoadingState />

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current))
    setSaved(false)
  }

  return (
    <form
      className="max-w-xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        setSaveFailed(false)
        void saveSettings(settings)
          .then((next) => {
            setSettings(next)
            setSaved(true)
            refreshCapacity()
          })
          .catch(() => setSaveFailed(true))
      }}
    >
      <h1 className="text-xl font-semibold">{t('admin.nav.settings')}</h1>
      <fieldset className="space-y-3">
        <legend className="font-semibold">{t('admin.settings.quota')}</legend>
        <NumberField
          label={t('admin.user.images')}
          value={settings.defaultMaxImages}
          onChange={(value) => update('defaultMaxImages', value)}
        />
        <NumberField
          label={t('admin.settings.storageMb')}
          value={megabytes(settings.defaultMaxBytes)}
          onChange={(value) => update('defaultMaxBytes', bytesFromMb(value))}
        />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-semibold">{t('admin.settings.kinds')}</legend>
        <NumberField
          label={t('admin.settings.kindsPerTrip')}
          value={settings.defaultMaxKinds}
          min={1}
          max={64}
          onChange={(value) => update('defaultMaxKinds', value)}
        />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-semibold">
          {t('admin.settings.capacity')}
        </legend>
        <NumberField
          label={t('admin.settings.databaseMb')}
          value={megabytes(settings.dbCapacityBytes)}
          onChange={(value) => update('dbCapacityBytes', bytesFromMb(value))}
        />
        <NumberField
          label={t('admin.settings.imagesMb')}
          value={megabytes(settings.blobCapacityBytes)}
          onChange={(value) => update('blobCapacityBytes', bytesFromMb(value))}
        />
        <NumberField
          label={t('admin.settings.warn')}
          value={settings.capacityWarnPct}
          min={1}
          max={100}
          onChange={(value) => update('capacityWarnPct', value)}
        />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="font-semibold">
          {t('admin.settings.switches')}
        </legend>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={settings.uploadsEnabled}
            onChange={(event) => update('uploadsEnabled', event.target.checked)}
          />
          {t('admin.settings.uploads')}
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={settings.signupsEnabled}
            onChange={(event) => update('signupsEnabled', event.target.checked)}
          />
          {t('admin.settings.signups')}
        </label>
      </fieldset>
      {saved ? <p role="status">{t('admin.settings.saved')}</p> : null}
      {saveFailed ? (
        <ErrorNotice>{t('admin.user.errors.save')}</ErrorNotice>
      ) : null}
      <Button type="submit">{t('trips.save')}</Button>
    </form>
  )
}

function NumberField({
  label,
  value,
  min = 0,
  max,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
      />
    </label>
  )
}
