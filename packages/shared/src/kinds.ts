import { z } from 'zod'

/**
 * White pin symbols a kind can show. `home` and `calendar` stay system-only.
 *
 * APPEND-ONLY: a symbol's index is its cell in the texture atlas
 * (`docs/textures/README.md`, row by row, 8 per row). Removing or reordering a
 * key moves texture cells, so new symbols are only ever added at the end.
 */
export const kindSymbols = [
  'exclamation',
  'question',
  'dot',
  'star',
  'heart',
  'food',
  'coffee',
  'camera',
  'shopping',
  'nature',
  'temple',
  'cat',
  'beer',
  'wine',
  'cocktail',
  'pizza',
  'soup',
  'cake',
  'ice_cream',
  'fish',
  'hotel',
  'bed',
  'tent',
  'mountain',
  'beach',
  'water',
  'flower',
  'leaf',
  'sun',
  'snow',
  'sunset',
  'castle',
  'church',
  'building',
  'train',
  'bus',
  'car',
  'plane',
  'ship',
  'bike',
  'walk',
  'parking',
  'fuel',
  'music',
  'theater',
  'film',
  'game',
  'ticket',
  'gift',
  'book',
  'shirt',
  'store',
  'market',
  'money',
  'hospital',
  'info',
  'wifi',
  'bath',
  'sparkles',
  'dog',
  'bird',
  'flag',
  'pin',
  'bookmark',
] as const
export const kindSymbolSchema = z.enum(kindSymbols)
export type KindSymbol = z.infer<typeof kindSymbolSchema>

/** Guards the catalog size; the texture atlas has exactly this many cells. */
export const kindSymbolCount = 64

/**
 * The lucide icon (export name of `lucide-react`) each symbol draws, or null
 * for the text glyphs (`!`, `?`) and the plain dot.
 */
export const kindSymbolIcons: Record<KindSymbol, string | null> = {
  exclamation: null,
  question: null,
  dot: null,
  star: 'Star',
  heart: 'Heart',
  food: 'Utensils',
  coffee: 'Coffee',
  camera: 'Camera',
  shopping: 'ShoppingBag',
  nature: 'Trees',
  temple: 'Landmark',
  cat: 'Cat',
  beer: 'Beer',
  wine: 'Wine',
  cocktail: 'Martini',
  pizza: 'Pizza',
  soup: 'Soup',
  cake: 'CakeSlice',
  ice_cream: 'IceCreamCone',
  fish: 'Fish',
  hotel: 'Hotel',
  bed: 'BedDouble',
  tent: 'Tent',
  mountain: 'Mountain',
  beach: 'TreePalm',
  water: 'Waves',
  flower: 'Flower',
  leaf: 'Leaf',
  sun: 'Sun',
  snow: 'Snowflake',
  sunset: 'Sunset',
  castle: 'Castle',
  church: 'Church',
  building: 'Building2',
  train: 'TrainFront',
  bus: 'Bus',
  car: 'Car',
  plane: 'Plane',
  ship: 'Ship',
  bike: 'Bike',
  walk: 'Footprints',
  parking: 'SquareParking',
  fuel: 'Fuel',
  music: 'Music',
  theater: 'Drama',
  film: 'Clapperboard',
  game: 'Gamepad2',
  ticket: 'Ticket',
  gift: 'Gift',
  book: 'BookOpen',
  shirt: 'Shirt',
  store: 'Store',
  market: 'ShoppingBasket',
  money: 'Banknote',
  hospital: 'Hospital',
  info: 'Info',
  wifi: 'Wifi',
  bath: 'Bath',
  sparkles: 'Sparkles',
  dog: 'Dog',
  bird: 'Bird',
  flag: 'Flag',
  pin: 'MapPin',
  bookmark: 'Bookmark',
}

/** The glyph a non-icon symbol draws as text; `dot` is a filled circle. */
export const kindSymbolGlyphs: Partial<Record<KindSymbol, string>> = {
  exclamation: '!',
  question: '?',
}

/** Texture atlas cell index of a symbol (row by row, 8 cells per row). */
export function kindSymbolIndex(symbol: KindSymbol): number {
  return kindSymbols.indexOf(symbol)
}

export const kindPresets = [
  'must_go',
  'maybe',
  'food',
  'sights',
  'shopping',
  'coffee',
  'nature',
  'nightlife',
] as const
export const kindPresetSchema = z.enum(kindPresets)
export type KindPreset = z.infer<typeof kindPresetSchema>

export const kindLimits = {
  name: 30,
  perSpot: 2,
  /** `app_settings.default_max_kinds` default. */
  defaultPerTrip: 12,
  /** Hard ceiling of any trip's kind limit. */
  ceiling: 64,
} as const

/** Every preset kind with its fixed color and symbol, in menu order. */
export const presetKinds: readonly {
  preset: KindPreset
  color: string
  symbol: KindSymbol
}[] = [
  { preset: 'must_go', color: '#E5484D', symbol: 'exclamation' },
  { preset: 'maybe', color: '#30A46C', symbol: 'question' },
  { preset: 'food', color: '#D9480F', symbol: 'food' },
  { preset: 'sights', color: '#6D28D9', symbol: 'camera' },
  { preset: 'shopping', color: '#D6409F', symbol: 'shopping' },
  { preset: 'coffee', color: '#A16207', symbol: 'coffee' },
  { preset: 'nature', color: '#0F766E', symbol: 'nature' },
  { preset: 'nightlife', color: '#A21CAF', symbol: 'cocktail' },
]

/** Presets every new trip starts with, in this order. */
export const starterPresets: readonly KindPreset[] = [
  'must_go',
  'maybe',
  'food',
  'sights',
]

export function presetKind(preset: KindPreset) {
  const found = presetKinds.find((kind) => kind.preset === preset)
  if (!found) throw new Error(`unknown preset ${preset}`)
  return found
}

/** Colors of the fixed system states. A kind may not use them. */
export const reservedKindColors = {
  planned: '#3E63DD',
  home: '#F5A524',
} as const

/** The color picker's swatches. Each one passes {@link kindColorError}. */
export const kindSwatches = [
  '#E5484D',
  '#D9480F',
  '#A16207',
  '#30A46C',
  '#0F766E',
  '#0E7490',
  '#6D28D9',
  '#A21CAF',
  '#D6409F',
  '#57534E',
] as const

export const kindMinContrast = 3

const hexColor = /^#[0-9A-Fa-f]{6}$/

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG contrast ratio of a `#RRGGBB` color against white. */
export function contrastWithWhite(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const luminance =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  return 1.05 / (luminance + 0.05)
}

export type KindColorError =
  'invalid' | 'kind_color_reserved' | 'kind_color_contrast'

/** Null when the color is a usable kind color. Reserved is checked before contrast. */
export function kindColorError(value: string): KindColorError | null {
  if (!hexColor.test(value)) return 'invalid'
  const upper = value.toUpperCase()
  if (Object.values(reservedKindColors).includes(upper as never)) {
    return 'kind_color_reserved'
  }
  if (contrastWithWhite(upper) < kindMinContrast) return 'kind_color_contrast'
  return null
}

/** Stored form of a valid color: upper-case `#RRGGBB`. */
export function normalizeKindColor(value: string): string {
  return value.toUpperCase()
}

/** Trimmed name, or the reason it is not allowed. */
export function kindNameError(value: string): 'empty' | 'too_long' | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'empty'
  if (trimmed.length > kindLimits.name) return 'too_long'
  return null
}

/** A kind as a spot carries it. `name` is null for an unrenamed preset. */
export const spotKindRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  preset: kindPresetSchema.nullable(),
  color: z.string(),
  symbol: kindSymbolSchema,
})
export type SpotKindRef = z.infer<typeof spotKindRefSchema>

export const spotKindSchema = spotKindRefSchema.extend({
  sortOrder: z.number().int().nonnegative(),
  spotCount: z.number().int().nonnegative(),
})
export type SpotKind = z.infer<typeof spotKindSchema>

export const kindListSchema = z.object({
  kinds: z.array(spotKindSchema),
  /** Effective kind limit: `COALESCE(trips.max_kinds, default_max_kinds)`. */
  limit: z.number().int().min(1).max(kindLimits.ceiling),
  count: z.number().int().nonnegative(),
})
export type KindList = z.infer<typeof kindListSchema>

function checkName(value: string, ctx: z.RefinementCtx) {
  const error = kindNameError(value)
  if (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['name'],
      message: error,
    })
  }
}

function checkColor(value: string, ctx: z.RefinementCtx) {
  const error = kindColorError(value)
  if (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['color'],
      message: error,
    })
  }
}

/**
 * Either `{preset}` (a ready-made kind with its fixed color and symbol) or a
 * custom `{name, color, symbol?}`. The symbol is a plain string here so the
 * route can answer an unknown one with 400 `kind_symbol_unknown` instead of a
 * generic validation error.
 */
export const createKindSchema = z
  .object({
    name: z.string().optional(),
    color: z.string().optional(),
    symbol: z.string().optional(),
    preset: z.string().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.preset !== undefined) {
      if (!(kindPresets as readonly string[]).includes(data.preset)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['preset'],
          message: 'invalid',
        })
      }
      for (const key of ['name', 'color', 'symbol'] as const) {
        if (data[key] !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'invalid',
          })
        }
      }
      return
    }
    if (data.name === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'empty',
      })
    } else checkName(data.name, ctx)
    if (data.color === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['color'],
        message: 'invalid',
      })
    } else checkColor(data.color, ctx)
  })
export type CreateKindBody =
  { preset: KindPreset } | { name: string; color: string; symbol?: string }

export const patchKindSchema = z
  .object({
    name: z.string().optional(),
    color: z.string().optional(),
    symbol: z.string().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.name !== undefined) checkName(data.name, ctx)
    if (data.color !== undefined) checkColor(data.color, ctx)
    if (
      data.name === undefined &&
      data.color === undefined &&
      data.symbol === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: 'empty',
      })
    }
  })
export type PatchKindBody = z.infer<typeof patchKindSchema>

export const reorderKindsSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(kindLimits.ceiling),
  })
  .strict()
export type ReorderKindsBody = z.infer<typeof reorderKindsSchema>

export function isKindSymbol(value: string): value is KindSymbol {
  return (kindSymbols as readonly string[]).includes(value)
}

/** Error codes the kinds routes and the spots routes answer with. */
export const kindErrorCodes = [
  'kind_name_taken',
  'kind_limit',
  'kind_last',
  'kind_symbol_unknown',
  'kind_color_contrast',
  'kind_color_reserved',
  'kind_not_found',
  'kind_move_required',
  'kind_move_same',
  'kind_preset_taken',
  'request_pending',
] as const
export type KindErrorCode = (typeof kindErrorCodes)[number]

export function isKindPreset(value: string): value is KindPreset {
  return (kindPresets as readonly string[]).includes(value)
}

/** R-29-09: a board admin or owner asks the platform admin for more kinds. */
export const kindLimitRequestCreateSchema = z
  .object({
    requestedMax: z.number().int().min(1).max(kindLimits.ceiling),
    message: z.string().trim().max(500).optional(),
  })
  .strict()
export type KindLimitRequestCreate = z.infer<
  typeof kindLimitRequestCreateSchema
>

export const requestStatuses = ['pending', 'approved', 'rejected'] as const

export const kindLimitRequestSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  requestedBy: z.string().uuid().nullable(),
  requestedMax: z.number().int().min(1).max(kindLimits.ceiling),
  message: z.string().nullable(),
  status: z.enum(requestStatuses),
  decisionNote: z.string().nullable(),
  decidedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})
export type KindLimitRequest = z.infer<typeof kindLimitRequestSchema>

/** `GET /trips/:id/kind-limit-requests/latest`; `request` is null when none. */
export const latestKindLimitRequestSchema = z.object({
  request: kindLimitRequestSchema.nullable(),
})
export type LatestKindLimitRequest = z.infer<
  typeof latestKindLimitRequestSchema
>
