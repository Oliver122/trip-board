import type { Pool, QueryResultRow } from 'pg'

export const pageSize = 50

export type SortSpec = {
  expr: string
  cast: 'text' | 'int' | 'bigint' | 'timestamptz'
}

export type Cursor = {
  k: string
  id: string
}

export function encodeCursor(k: string, id: string): string {
  return Buffer.from(JSON.stringify({ k, id }), 'utf8').toString('base64url')
}

export function decodeCursor(
  value: string | undefined,
): Cursor | 'invalid' | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { k?: unknown; id?: unknown }
    if (typeof parsed.k !== 'string' || typeof parsed.id !== 'string') {
      return 'invalid'
    }
    if (parsed.k.length > 200 || parsed.id.length > 40) return 'invalid'
    return { k: parsed.k, id: parsed.id }
  } catch {
    return 'invalid'
  }
}

export async function listPage<T>(
  pool: Pool,
  input: {
    select: string
    from: string
    where: string
    params: unknown[]
    sort: SortSpec
    dir: 'ASC' | 'DESC'
    idExpr?: string
    idCast: 'uuid' | 'bigint'
    cursor: Cursor | null
    key: (row: QueryResultRow) => string
    id: (row: QueryResultRow) => string
    map: (row: QueryResultRow) => T
  },
): Promise<{ rows: T[]; nextCursor: string | null }> {
  const params = [...input.params]
  const idExpr = input.idExpr ?? 'id'
  let cursorSql = ''
  if (input.cursor) {
    const op = input.dir === 'ASC' ? '>' : '<'
    const keyIndex = params.length + 1
    const idIndex = params.length + 2
    params.push(input.cursor.k, input.cursor.id)
    cursorSql = `AND (${input.sort.expr}, ${idExpr}) ${op} ($${keyIndex}::${input.sort.cast}, $${idIndex}::${input.idCast})`
  }
  const limitIndex = params.length + 1
  params.push(pageSize + 1)
  const result = await pool.query<QueryResultRow>(
    `
    SELECT ${input.select}
    ${input.from}
    WHERE ${input.where}
    ${cursorSql}
    ORDER BY ${input.sort.expr} ${input.dir}, ${idExpr} ${input.dir}
    LIMIT $${limitIndex}
    `,
    params,
  )
  const page = result.rows.slice(0, pageSize)
  const last = page[page.length - 1]
  const nextCursor =
    result.rows.length > pageSize && last
      ? encodeCursor(input.key(last), input.id(last))
      : null
  return { rows: page.map(input.map), nextCursor }
}

export function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

export function num(value: string | number | null | undefined): number {
  return Number(value ?? 0)
}

export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  )
}

export function isInvalidCursor(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === '22P02' || error.code === '22007' || error.code === '22003')
  )
}
