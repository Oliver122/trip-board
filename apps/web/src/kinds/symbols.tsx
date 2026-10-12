import { kindSymbolGlyphs, type KindSymbol } from '@tripboard/shared'
import {
  Banknote,
  Beer,
  Bike,
  Bird,
  Bath,
  BedDouble,
  BookOpen,
  Bookmark,
  Building2,
  Bus,
  CakeSlice,
  Camera,
  Car,
  Castle,
  Cat,
  Church,
  Clapperboard,
  Coffee,
  Dog,
  Drama,
  Fish,
  Flag,
  Flower,
  Footprints,
  Fuel,
  Gamepad2,
  Gift,
  Heart,
  Hospital,
  Hotel,
  IceCreamCone,
  Info,
  Landmark,
  Leaf,
  MapPin,
  Martini,
  Mountain,
  Music,
  Pizza,
  Plane,
  ShoppingBag,
  ShoppingBasket,
  Ship,
  Shirt,
  Snowflake,
  Soup,
  Sparkles,
  SquareParking,
  Star,
  Store,
  Sun,
  Sunset,
  Tent,
  Ticket,
  TrainFront,
  TreePalm,
  Trees,
  Utensils,
  Waves,
  Wifi,
  Wine,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/utils'

/** Every symbol drawn by a lucide icon; `kindSymbolIcons` (shared) names the export. */
export const symbolIcons: Partial<Record<KindSymbol, LucideIcon>> = {
  star: Star,
  heart: Heart,
  food: Utensils,
  coffee: Coffee,
  camera: Camera,
  shopping: ShoppingBag,
  nature: Trees,
  temple: Landmark,
  cat: Cat,
  beer: Beer,
  wine: Wine,
  cocktail: Martini,
  pizza: Pizza,
  soup: Soup,
  cake: CakeSlice,
  ice_cream: IceCreamCone,
  fish: Fish,
  hotel: Hotel,
  bed: BedDouble,
  tent: Tent,
  mountain: Mountain,
  beach: TreePalm,
  water: Waves,
  flower: Flower,
  leaf: Leaf,
  sun: Sun,
  snow: Snowflake,
  sunset: Sunset,
  castle: Castle,
  church: Church,
  building: Building2,
  train: TrainFront,
  bus: Bus,
  car: Car,
  plane: Plane,
  ship: Ship,
  bike: Bike,
  walk: Footprints,
  parking: SquareParking,
  fuel: Fuel,
  music: Music,
  theater: Drama,
  film: Clapperboard,
  game: Gamepad2,
  ticket: Ticket,
  gift: Gift,
  book: BookOpen,
  shirt: Shirt,
  store: Store,
  market: ShoppingBasket,
  money: Banknote,
  hospital: Hospital,
  info: Info,
  wifi: Wifi,
  bath: Bath,
  sparkles: Sparkles,
  dog: Dog,
  bird: Bird,
  flag: Flag,
  pin: MapPin,
  bookmark: Bookmark,
}

/** The white symbol of a kind, drawn inside a pin or a badge. */
export function KindSymbolIcon({
  symbol,
  className,
}: {
  symbol: KindSymbol
  className?: string
}) {
  const Icon = symbolIcons[symbol]
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
      {kindSymbolGlyphs[symbol]}
    </span>
  )
}
