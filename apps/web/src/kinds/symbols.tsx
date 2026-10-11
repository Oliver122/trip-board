import type { KindSymbol } from '@tripboard/shared'
import {
  Camera,
  Cat,
  Coffee,
  Heart,
  Landmark,
  ShoppingBag,
  Star,
  Trees,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/utils'

const icons: Partial<Record<KindSymbol, LucideIcon>> = {
  star: Star,
  heart: Heart,
  food: Utensils,
  coffee: Coffee,
  camera: Camera,
  shopping: ShoppingBag,
  nature: Trees,
  temple: Landmark,
  cat: Cat,
}

// The two presets keep today's text glyphs, so their pins look unchanged.
const glyphs: Partial<Record<KindSymbol, string>> = {
  exclamation: '!',
  question: '?',
}

/** The white symbol of a kind, drawn inside a pin or a badge. */
export function KindSymbolIcon({
  symbol,
  className,
}: {
  symbol: KindSymbol
  className?: string
}) {
  const Icon = icons[symbol]
  if (Icon) {
    return (
      <Icon
        aria-hidden="true"
        data-icon={symbol}
        className={cn('size-3.5', className)}
      />
    )
  }
  if (symbol === 'dot') {
    return (
      <span
        aria-hidden="true"
        data-icon={symbol}
        className={cn('block size-1.5 rounded-full bg-current', className)}
      />
    )
  }
  return (
    <span aria-hidden="true" data-icon={symbol} className={className}>
      {glyphs[symbol]}
    </span>
  )
}
