import { z } from 'zod'

/** White pin symbols a kind can show. `home` and `calendar` stay system-only. */
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
] as const
export const kindSymbolSchema = z.enum(kindSymbols)
export type KindSymbol = z.infer<typeof kindSymbolSchema>

export const kindPresets = ['must_go', 'maybe'] as const
export const kindPresetSchema = z.enum(kindPresets)
export type KindPreset = z.infer<typeof kindPresetSchema>

export const kindLimits = {
  name: 30,
  perTrip: 12,
  perSpot: 2,
} as const

/** Kinds every new trip starts with, in this order. */
export const presetKinds: readonly {
  preset: KindPreset
  color: string
  symbol: KindSymbol
}[] = [
  { preset: 'must_go', color: '#E5484D', symbol: 'exclamation' },
  { preset: 'maybe', color: '#30A46C', symbol: 'question' },
]

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
 * The symbol is a plain string here so the route can answer an unknown one
 * with 400 `kind_symbol_unknown` instead of a generic validation error.
 */
export const createKindSchema = z
  .object({
    name: z.string(),
    color: z.string(),
    symbol: z.string().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    checkName(data.name, ctx)
    checkColor(data.color, ctx)
  })
export type CreateKindBody = z.infer<typeof createKindSchema>

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
    ids: z.array(z.string().uuid()).min(1).max(kindLimits.perTrip),
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
] as const
export type KindErrorCode = (typeof kindErrorCodes)[number]
