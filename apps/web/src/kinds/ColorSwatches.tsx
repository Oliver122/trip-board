import { kindSwatches } from '@tripboard/shared'
import { hoverClass } from '../components/ui/hover'
import { cn } from '../lib/utils'
import { selectedRing, SelectedCheck } from './selection'

/** The 10 kind colors as toggle buttons; the current one is pressed. */
export function ColorSwatches({
  value,
  disabled,
  onPick,
}: {
  value: string
  disabled?: boolean
  onPick: (color: string) => void
}) {
  const current = value.toUpperCase()
  return (
    <div className="flex flex-wrap gap-2">
      {kindSwatches.map((swatch) => (
        <button
          key={swatch}
          type="button"
          aria-label={swatch}
          aria-pressed={swatch === current}
          disabled={disabled}
          data-testid="kind-color-swatch"
          onClick={() => onPick(swatch)}
          className={cn(
            hoverClass.pin,
            'relative inline-flex size-11 items-center justify-center rounded-full border-2 border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
            swatch === current && selectedRing,
          )}
        >
          <span
            aria-hidden="true"
            className="size-7 rounded-full"
            style={{ backgroundColor: swatch }}
          />
          {swatch === current && <SelectedCheck />}
        </button>
      ))}
    </div>
  )
}
