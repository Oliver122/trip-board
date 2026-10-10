import { apiErrorBodySchema, type ApiErrorBody } from '@tripboard/shared'
import { writeInit } from './write'

/** Structural subset of a zod schema, so the web app needs no direct zod dependency. */
type Schema<T> = { parse: (data: unknown) => T }

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string>
  readonly body: ApiErrorBody | null

  constructor(status: number, body: ApiErrorBody | null = null) {
    const code = body?.error ?? (status === 0 ? 'network' : `http_${status}`)
    super(code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = body?.fields ?? {}
    this.body = body
  }
}

async function readBody(response: Response): Promise<ApiErrorBody | null> {
  try {
    const parsed = apiErrorBodySchema.safeParse(await response.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const next = writeInit(init)
  const headers = new Headers(next.headers)
  if (typeof next.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  let response: Response
  try {
    response = await fetch(path, { ...next, headers, credentials: 'include' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiError(0)
  }
  if (!response.ok) {
    throw new ApiError(response.status, await readBody(response))
  }
  return response
}

export async function requestJson<T>(
  path: string,
  schema: Schema<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await request(path, init)
  return schema.parse(await response.json())
}

export function isAuth(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 401
}

export function isNotFound(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 404
}

export function isConflict(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 409
}

export function isInvalid(e: unknown): e is ApiError {
  return (
    e instanceof ApiError &&
    e.status === 400 &&
    Object.keys(e.fields).length > 0
  )
}

export function conflictOf<T>(
  e: ApiError,
  schema: Schema<T>,
): { current: T; updatedBy: { id: string; name: string } | null } {
  const raw = e.body as { current?: unknown; updatedBy?: unknown } | null
  const by = raw?.updatedBy as { id?: unknown; name?: unknown } | null
  const updatedBy =
    by && typeof by.id === 'string' && typeof by.name === 'string'
      ? { id: by.id, name: by.name }
      : null
  return { current: schema.parse(raw?.current), updatedBy }
}
