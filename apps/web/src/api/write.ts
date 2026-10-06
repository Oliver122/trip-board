const storageKey = 'tripboard:client'
let memoryId = ''

export function clientId(): string {
  try {
    const existing = sessionStorage.getItem(storageKey)
    if (existing) return existing
    const next = crypto.randomUUID()
    sessionStorage.setItem(storageKey, next)
    return next
  } catch {
    if (!memoryId) memoryId = crypto.randomUUID()
    return memoryId
  }
}

/** Adds the per-tab client id to write requests so live events can ignore them. */
export function writeInit(init: RequestInit = {}): RequestInit {
  const method = (init.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return init
  const headers = new Headers(init.headers)
  headers.set('x-client-id', clientId())
  return { ...init, headers }
}
