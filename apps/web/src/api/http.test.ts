import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  conflictOf,
  isAuth,
  isConflict,
  isInvalid,
  isNotFound,
  request,
  requestJson,
} from './http'
import { clientId } from './write'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function failure(run: Promise<unknown>): Promise<ApiError> {
  try {
    await run
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('expected a rejection')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request', () => {
  it('T-26-09 sends credentials, JSON content type and the client id on writes', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json(200, {})))
    await request('/api/x', { method: 'POST', body: '{"a":1}' })
    const [path, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    const headers = new Headers(init.headers)
    expect(path).toBe('/api/x')
    expect(init.credentials).toBe('include')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-client-id')).toBe(clientId())
  })

  it('T-26-09 leaves reads without a client id', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json(200, {})))
    await request('/api/x')
    const init = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1]
    expect(new Headers(init.headers).has('x-client-id')).toBe(false)
  })

  it('T-26-09 throws an ApiError with fields for 400', async () => {
    stubFetch(() =>
      Promise.resolve(
        json(400, { error: 'invalid_request', fields: { name: 'required' } }),
      ),
    )
    const error = await failure(request('/api/x'))
    expect(error.status).toBe(400)
    expect(error.code).toBe('invalid_request')
    expect(error.fields).toEqual({ name: 'required' })
    expect(isInvalid(error)).toBe(true)
  })

  it('T-26-09 classifies 401 and 404', async () => {
    stubFetch(() => Promise.resolve(json(401, { error: 'unauthenticated' })))
    expect(isAuth(await failure(request('/api/x')))).toBe(true)
    stubFetch(() => Promise.resolve(json(404, { error: 'not_found' })))
    expect(isNotFound(await failure(request('/api/x')))).toBe(true)
  })

  it('T-26-09 exposes current and updatedBy for 409 via conflictOf', async () => {
    const trip = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Lisbon',
      startDate: null,
      endDate: null,
      region: null,
      role: 'owner',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }
    stubFetch(() =>
      Promise.resolve(
        json(409, {
          error: 'conflict',
          current: trip,
          updatedBy: { id: 'u1', name: 'Ada' },
        }),
      ),
    )
    const error = await failure(request('/api/x'))
    expect(isConflict(error)).toBe(true)
    const parsed = conflictOf(error, {
      parse: (value) => (value as { name: string }).name,
    })
    expect(parsed).toEqual({
      current: 'Lisbon',
      updatedBy: { id: 'u1', name: 'Ada' },
    })
  })

  it('T-26-09 falls back to http_<status> for 500 without a body', async () => {
    stubFetch(() => Promise.resolve(new Response('boom', { status: 500 })))
    const error = await failure(request('/api/x'))
    expect(error.status).toBe(500)
    expect(error.code).toBe('http_500')
    expect(error.body).toBeNull()
  })

  it('T-26-09 maps a network failure to status 0', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    const error = await failure(request('/api/x'))
    expect(error.status).toBe(0)
    expect(error.code).toBe('network')
  })

  it('T-26-09 passes an AbortError through unchanged', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    stubFetch(() => Promise.reject(abort))
    await expect(request('/api/x')).rejects.toBe(abort)
  })
})

describe('requestJson', () => {
  it('T-26-09 parses the body with the schema', async () => {
    stubFetch(() => Promise.resolve(json(200, { n: 2 })))
    const value = await requestJson('/api/x', {
      parse: (data) => (data as { n: number }).n,
    })
    expect(value).toBe(2)
  })
})
