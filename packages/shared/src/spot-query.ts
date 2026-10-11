import { z } from 'zod'

/**
 * One category filter token: a kind id, `planned`, `home`, or a legacy preset
 * name (`must_go`, `maybe`) that the API maps to the preset kind while it exists.
 */
export type SpotCategoryFilter = string

const categoryFilterPattern =
  /^(planned|home|must_go|maybe|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

export function isCategoryFilter(value: string): boolean {
  return categoryFilterPattern.test(value)
}

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
  cat: SpotCategoryFilter[]
  status: SpotListStatus
  by: string | null
  entry: string | null
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
  entry: null,
  sort: 'scheduled',
  visible: false,
}

export function spotFiltersActive(
  query: Pick<SpotListQuery, 'q' | 'cat' | 'status' | 'by' | 'entry'>,
): boolean {
  return activeFilterCount(query) > 0
}

/** Search, each category, status, author, and plan entry. Sort is not a filter. */
export function activeFilterCount(
  query: Pick<SpotListQuery, 'q' | 'cat' | 'status' | 'by' | 'entry'>,
): number {
  return (
    (query.q.trim().length > 0 ? 1 : 0) +
    query.cat.length +
    (query.status !== 'all' ? 1 : 0) +
    (query.by ? 1 : 0) +
    (query.entry ? 1 : 0)
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
  listFollowsMap = false,
): SpotListQuery {
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search
  const cat: SpotCategoryFilter[] = []
  for (const part of (params.get('cat') ?? '').split(',')) {
    const value = part.trim()
    if (!isCategoryFilter(value)) continue
    const category = value as SpotCategoryFilter
    if (!cat.includes(category)) cat.push(category)
  }
  const status = spotListStatusSchema.safeParse(params.get('status'))
  const by = z.string().uuid().safeParse(params.get('by'))
  const entry = z.string().uuid().safeParse(params.get('entry'))
  const sort = spotSortSchema.safeParse(params.get('sort'))
  const visibleRaw = params.get('visible')
  let visible = listFollowsMap
  if (visibleRaw === '0' || visibleRaw === 'false') visible = false
  else if (visibleRaw === '1' || visibleRaw === 'true') visible = true
  return {
    q: params.get('q') ?? '',
    cat,
    status: status.success ? status.data : 'all',
    by: by.success ? by.data : null,
    entry: entry.success ? entry.data : null,
    sort: sort.success ? sort.data : 'scheduled',
    visible,
  }
}

export function spotListSearchParams(
  query: SpotListQuery,
  listFollowsMap = false,
): URLSearchParams {
  const params = new URLSearchParams()
  if (query.q.length > 0) params.set('q', query.q)
  if (query.cat.length > 0) params.set('cat', query.cat.join(','))
  if (query.status !== 'all') params.set('status', query.status)
  if (query.by) params.set('by', query.by)
  if (query.entry) params.set('entry', query.entry)
  if (query.sort !== 'scheduled') params.set('sort', query.sort)
  if (query.visible !== listFollowsMap) {
    params.set('visible', query.visible ? '1' : '0')
  }
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
  let cat: SpotCategoryFilter[] = []
  let status: SpotListStatus = 'all'
  let by: string | null = null
  let entry: string | null = null
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
  if ('entry' in source) {
    const parsed = z.string().uuid().safeParse(source.entry)
    if (!parsed.success) fields.entry = 'invalid'
    else entry = parsed.data
  }
  if ('sort' in source) {
    const parsed = spotSortSchema.safeParse(source.sort)
    if (!parsed.success) fields.sort = 'invalid'
    else sort = parsed.data
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields }
  return { ok: true, filters: { q, cat, status, by, entry, sort } }
}

function categoryList(value: unknown): SpotCategoryFilter[] | null {
  if (typeof value !== 'string') return null
  const cats: SpotCategoryFilter[] = []
  for (const part of value.split(',')) {
    const token = part.trim()
    if (token.length === 0) continue
    if (!isCategoryFilter(token)) return null
    const category = token as SpotCategoryFilter
    if (!cats.includes(category)) cats.push(category)
  }
  return cats
}
