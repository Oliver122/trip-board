import { isGoogleMapsUrl } from '@tripboard/shared'

export const maxHops = 5
export const resolveTimeoutMs = 5000

export class LinkResolveError extends Error {
  constructor() {
    super('link_resolve_failed')
    this.name = 'LinkResolveError'
  }
}

const shortHosts = new Set(['maps.app.goo.gl', 'goo.gl'])

export function isShortLink(url: string): boolean {
  try {
    return shortHosts.has(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}

/** Where a redirect to `location` leads: the URL itself or a consent `continue`. */
function nextUrl(current: string, location: string): string {
  let next: URL
  try {
    next = new URL(location, current)
  } catch {
    throw new LinkResolveError()
  }
  if (next.protocol !== 'https:' && next.protocol !== 'http:') {
    throw new LinkResolveError()
  }
  if (next.hostname.toLowerCase() === 'consent.google.com') {
    const target = next.searchParams.get('continue')
    if (!target) throw new LinkResolveError()
    try {
      next = new URL(target)
    } catch {
      throw new LinkResolveError()
    }
  }
  if (!isGoogleMapsUrl(next.toString())) throw new LinkResolveError()
  return next.toString()
}

function discard(response: Response): void {
  response.body?.cancel().catch(() => undefined)
}

/**
 * Follows a short link to the long Maps URL with HEAD requests only (a GET
 * whose body is never read when HEAD answers 405). No page body is read.
 */
export async function resolveShortLink(
  start: string,
  fetcher: typeof fetch,
): Promise<string> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new LinkResolveError())
    }, resolveTimeoutMs)
  })
  const follow = async (): Promise<string> => {
    let current = start
    for (let hop = 0; hop < maxHops + 1; hop += 1) {
      if (!isShortLink(current)) return current
      if (hop === maxHops) throw new LinkResolveError()
      const response = await request(current, controller.signal, fetcher)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new LinkResolveError()
        current = nextUrl(current, location)
        continue
      }
      if (response.status >= 200 && response.status < 300) return current
      throw new LinkResolveError()
    }
    throw new LinkResolveError()
  }
  try {
    return await Promise.race([follow(), timeout])
  } catch (error) {
    if (error instanceof LinkResolveError) throw error
    throw new LinkResolveError()
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

async function request(
  url: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<Response> {
  const head = await fetcher(url, {
    method: 'HEAD',
    redirect: 'manual',
    signal,
  })
  discard(head)
  if (head.status !== 405) return head
  const get = await fetcher(url, { method: 'GET', redirect: 'manual', signal })
  discard(get)
  return get
}
