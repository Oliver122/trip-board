import type { FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'

type Queryable = Pool | PoolClient

const tables = {
  spots: 'spots',
  plan_entries: 'plan_entries',
  trips: 'trips',
} as const

export type StampTable = keyof typeof tables

export type Editor = { id: string; name: string }

export function readExpected(
  request: FastifyRequest,
): { ok: true; at: string | null } | { ok: false } {
  const header = request.headers['if-unmodified-since']
  let raw: string | null = null
  if (typeof header === 'string' && header.trim()) raw = header.trim()
  const body = request.body
  if (body && typeof body === 'object' && 'expectedUpdatedAt' in body) {
    const value = (body as { expectedUpdatedAt?: unknown }).expectedUpdatedAt
    if (value == null || value === '') {
      /* header still applies */
    } else if (typeof value !== 'string') {
      return { ok: false }
    } else if (value.trim()) {
      raw = value.trim()
    }
  }
  if (!raw) return { ok: true, at: null }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return { ok: false }
  return { ok: true, at: parsed.toISOString() }
}

export function sameInstant(current: Date, expected: string): boolean {
  const parsed = new Date(expected)
  if (Number.isNaN(parsed.getTime())) return false
  return current.getTime() === parsed.getTime()
}

export async function stampAgrees(
  db: Queryable,
  table: StampTable,
  id: string,
  expected: string | null,
): Promise<'ok' | 'conflict' | 'missing'> {
  if (!expected) return 'ok'
  const result = await db.query<{ updated_at: Date }>(
    `SELECT updated_at FROM ${tables[table]} WHERE id = $1`,
    [id],
  )
  const at = result.rows[0]?.updated_at
  if (!at) return 'missing'
  return sameInstant(at, expected) ? 'ok' : 'conflict'
}

export async function latestEditor(
  db: Queryable,
  entityId: string,
): Promise<Editor | null> {
  const result = await db.query<{ id: string; name: string }>(
    `
    SELECT u.id, COALESCE(u.display_name, u.username) AS name
    FROM activity_events e
    JOIN users u ON u.id = e.actor_id
    WHERE e.entity_id = $1
    ORDER BY e.id DESC
    LIMIT 1
    `,
    [entityId],
  )
  return result.rows[0] ?? null
}
