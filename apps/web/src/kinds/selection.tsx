import { Check } from 'lucide-react'

/** Ring of a selected symbol or swatch: 2 px foreground, 2 px gap to the card. */
export const selectedRing =
  'ring-2 ring-foreground ring-offset-2 ring-offset-card'

/** Small round check in the corner of a selected symbol or swatch. */
export function SelectedCheck() {
  return (
    <span
      data-testid="selected-check"
      className="pointer-events-none absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-foreground text-background"
    >
      <Check aria-hidden="true" className="size-3" strokeWidth={3} />
    </span>
  )
}
