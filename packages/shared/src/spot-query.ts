import { z } from 'zod'
import { displayCategories, type DisplayCategory } from './spots.js'

export const spotSorts = [
  'scheduled',
  'datetime',
  'category',
  'az',
  'newest',
] as const
export const spotSortSchema = z.enum(spotSorts)
export type SpotSort = z.infer<typeof spotSortSchema>

export const spotListStatuses = ['all', 'scheduled', 'unscheduled'] as const
export const spotListStatusSchema = z.enum(spotListStatuses)
export type SpotListStatus = z.infer<typeof spotListStatusSchema>

/** Filters the board sends to `GET /trips/:id/spots`. `visible` stays on the client. */
export type SpotListFilters = {
  q: string
  cat: DisplayCategory[]
  status: SpotListStatus
  by: string | null
  sort: SpotSort
}

export type SpotListQuery = SpotListFilters & {
  visible: boolean
}

export const defaultSpotListQuery: SpotListQuery = {
  q: '',
  cat: [],
  status: 'all',
  by: null,
  sort: 'scheduled',
  visible: true,
}

const displayCategorySet = new Set<string>(displayCategories)

export function spotFiltersActive(
  query: Pick<SpotListQuery, 'q' | 'cat' | 'status' | 'by'>,
): boolean {
  return (
    query.q.trim().length > 0 ||
    query.cat.length > 0 ||
    query.status !== 'all' ||
    query.by !== null
  )
}

/**
 * LIKE pattern for a literal substring. `%`, `_`, and the escape character
 * are matched as characters, not wildcards.
 */
export function spotSearchPattern(query: string): string | null {
  const trimmed = query.trim()
  if (trimmed.length === 0) return null
  const escaped = trimmed
    .replaceAll('!', '!!')
    .replaceAll('%', '!%')
    .replaceAll('_', '!_')
  return `%${escaped}%`
}

export function parseSpotListQuery(
  search: string | URLSearchParams,
): SpotListQuery {
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search
  const cat: DisplayCategory[] = []
  for (const part of (params.get('cat') ?? '').split(',')) {
    const value = part.trim()
    if (!displayCategorySet.has(value)) continue
    const category = value as DisplayCategory
    if (!cat.includes(category)) cat.push(category)
  }
  const status = spotListStatusSchema.safeParse(params.get('status'))
  const by = z.string().uuid().safeParse(params.get('by'))
  const sort = spotSortSchema.safeParse(params.get('sort'))
  const visibleRaw = params.get('visible')
  return {
    q: params.get('q') ?? '',
    cat,
    status: status.success ? status.data : 'all',
    by: by.success ? by.data : null,
    sort: sort.success ? sort.data : 'scheduled',
    visible: visibleRaw === '0' || visibleRaw === 'false' ? false : true,
  }
}

export function spotListSearchParams(query: SpotListQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.q.length > 0) params.set('q', query.q)
  if (query.cat.length > 0) params.set('cat', query.cat.join(','))
  if (query.status !== 'all') params.set('status', query.status)
  if (query.by) params.set('by', query.by)
  if (query.sort !== 'scheduled') params.set('sort', query.sort)
  if (!query.visible) params.set('visible', '0')
  return params
}

export function strictSpotListQuery(
  query: unknown,
):
  | { ok: true; filters: SpotListFilters }
  | { ok: false; fields: Record<string, string> } {
  const source =
    query !== null && typeof query === 'object'
      ? (query as Record<string, unknown>)
      : {}
  const fields: Record<string, string> = {}
  let q = ''
  let cat: DisplayCategory[] = []
  let status: SpotListStatus = 'all'
  let by: string | null = null
  let sort: SpotSort = 'scheduled'

  if ('q' in source) {
    if (typeof source.q !== 'string') fields.q = 'invalid'
    else q = source.q
  }
  if ('cat' in source) {
    const parsed = categoryList(source.cat)
    if (!parsed) fields.cat = 'invalid'
    else cat = parsed
  }
  if ('status' in source) {
    const parsed = spotListStatusSchema.safeParse(source.status)
    if (!parsed.success) fields.status = 'invalid'
    else status = parsed.data
  }
  if ('by' in source) {
    const parsed = z.string().uuid().safeParse(source.by)
    if (!parsed.success) fields.by = 'invalid'
    else by = parsed.data
  }
  if ('sort' in source) {
    const parsed = spotSortSchema.safeParse(source.sort)
    if (!parsed.success) fields.sort = 'invalid'
    else sort = parsed.data
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields }
  return { ok: true, filters: { q, cat, status, by, sort } }
}

function categoryList(value: unknown): DisplayCategory[] | null {
  if (typeof value !== 'string') return null
  const cats: DisplayCategory[] = []
  for (const part of value.split(',')) {
    const token = part.trim()
    if (token.length === 0) continue
    if (!displayCategorySet.has(token)) return null
    const category = token as DisplayCategory
    if (!cats.includes(category)) cats.push(category)
  }
  return cats
}
