import type { Spot } from '@tripboard/shared'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../components/ui/modal'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'

/** Chooses a spot for a photo that has no place (R-47-09). */
export function SpotPicker({
  spots,
  onPick,
  onClose,
}: {
  spots: Spot[]
  onPick: (spotId: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return spots
    return spots.filter((spot) =>
      `${spot.title} ${spot.address ?? ''}`.toLowerCase().includes(needle),
    )
  }, [query, spots])
  return (
    <Modal
      title={t('photobook.spotPickerTitle')}
      closeLabel={t('ui.close')}
      size="sm"
      testId="spot-picker"
      initialFocus={input}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 p-4">
        <label className="text-sm font-medium" htmlFor="spot-picker-search">
          {t('photobook.spotPickerSearch')}
        </label>
        <input
          ref={input}
          id="spot-picker-search"
          data-testid="spot-picker-search"
          type="search"
          value={query}
          className="min-h-11 w-full rounded-[8px] border border-border bg-card px-3"
          onChange={(event) => setQuery(event.target.value)}
        />
        {shown.length === 0 ? (
          <p className="text-sm text-muted">{t('photobook.spotPickerEmpty')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {shown.map((spot) => (
              <li key={spot.id}>
                <button
                  type="button"
                  data-testid={`spot-picker-option-${spot.id}`}
                  className={cn(
                    hoverClass.item,
                    'flex min-h-11 w-full flex-col items-start justify-center rounded-[8px] px-3 py-1 text-left',
                  )}
                  onClick={() => onPick(spot.id)}
                >
                  <span className="font-medium">{spot.title}</span>
                  {spot.address ? (
                    <span className="text-xs text-muted">{spot.address}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
