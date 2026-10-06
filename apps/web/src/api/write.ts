const storageKey = 'tripboard:client'
let memoryId = ''

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function clientId(): string {
  try {
    const existing = sessionStorage.getItem(storageKey)
    if (existing) return existing
    const next = randomId()
    sessionStorage.setItem(storageKey, next)
    return next
  } catch {
    if (!memoryId) memoryId = randomId()
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
