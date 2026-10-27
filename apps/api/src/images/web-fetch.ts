import { lookup as dnsLookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { fileSizeLimits } from '@tripboard/shared'

// Safe download of a user-chosen URL (R-34-03, R-34-04): only public
// addresses, the connection goes to the address that was checked, at most 3
// redirects (each one checked again), 10 s in total, at most `maxBytes`
// (the caller's per-file limit, R-43-03).

export const webFetchTimeoutMs = 10_000
export const webFetchMaxRedirects = 3

export type InterceptResponse = {
  status: number
  headers?: Record<string, string>
  body?: Buffer
}

export type WebFetchOptions = {
  /** Resolves a host name to IP addresses; tests inject one. */
  resolveHost?: (host: string) => Promise<string[]>
  /** Test hook: addresses that are allowed although they are not public. */
  allowAddress?: (address: string) => boolean
  /** Test hook: ports that are allowed besides 80 and 443. */
  allowPort?: (port: number) => boolean
  /** Answers a URL without any network access (test fixtures, NODE_ENV=test). */
  intercept?: (
    url: URL,
  ) => InterceptResponse | null | Promise<InterceptResponse | null>
  /** Test hook: connect somewhere else after the URL passed its checks. */
  rewrite?: (url: URL) => URL
  timeoutMs?: number
  maxRedirects?: number
  maxBytes?: number
  userAgent?: string
}

export type WebFetchCall = {
  /** Every hop (also redirects) must be on an accepted host. */
  hostAllowed?: (host: string) => boolean
}

export type WebFetchResult =
  | { ok: true; bytes: Buffer; finalUrl: string }
  | { ok: false; code: 'url_not_allowed' | 'fetch_failed' | 'too_large' }

type Failure = Extract<WebFetchResult, { ok: false }>

const fail = (code: Failure['code']): Failure => ({ ok: false, code })

/** A user-supplied URL for the download: http(s), port 80/443, ≤ 2000 chars. */
export function parseWebUrl(
  raw: string,
  maxLength: number,
  allowPort?: (port: number) => boolean,
): URL | null {
  if (raw.length === 0 || raw.length > maxLength) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!portAllowed(url, allowPort)) return null
  return url
}

function portAllowed(url: URL, allowPort?: (port: number) => boolean) {
  if (url.port === '') return true
  const port = Number(url.port)
  return port === 80 || port === 443 || allowPort?.(port) === true
}

export async function fetchWebImage(
  rawUrl: string,
  options: WebFetchOptions,
  call: WebFetchCall = {},
): Promise<WebFetchResult> {
  const timeoutMs = options.timeoutMs ?? webFetchTimeoutMs
  const maxRedirects = options.maxRedirects ?? webFetchMaxRedirects
  const maxBytes = options.maxBytes ?? fileSizeLimits.default
  let abort: (() => void) | null = null
  const timer = setTimeout(() => {
    abort?.()
  }, timeoutMs)

  try {
    let current = rawUrl
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      let url: URL
      try {
        url = new URL(current)
      } catch {
        return fail('fetch_failed')
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return fail('url_not_allowed')
      }
      if (!portAllowed(url, options.allowPort)) return fail('url_not_allowed')
      if (call.hostAllowed && !call.hostAllowed(url.hostname)) {
        return fail('url_not_allowed')
      }

      const answer = await answerFor(url, options, maxBytes, (fn) => {
        abort = fn
      }).catch(() => null)
      if (!answer) return fail('fetch_failed')
      if ('ok' in answer) return answer
      const { status, location, body } = answer
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        try {
          current = new URL(location, url).toString()
        } catch {
          return fail('fetch_failed')
        }
        continue
      }
      if (status < 200 || status > 299) return fail('fetch_failed')
      return { ok: true, bytes: body, finalUrl: url.toString() }
    }
    return fail('fetch_failed')
  } finally {
    clearTimeout(timer)
  }
}

type Answer = { status: number; location: string | null; body: Buffer }

async function answerFor(
  url: URL,
  options: WebFetchOptions,
  maxBytes: number,
  setAbort: (abort: () => void) => void,
): Promise<Answer | Failure> {
  const intercepted = await options.intercept?.(url)
  if (intercepted) {
    const body = intercepted.body ?? Buffer.alloc(0)
    if (body.length > maxBytes) return fail('too_large')
    return {
      status: intercepted.status,
      location: intercepted.headers?.location ?? null,
      body,
    }
  }

  const target = options.rewrite?.(url) ?? url
  const host = target.hostname.replace(/^\[|\]$/g, '')
  let addresses: string[]
  if (net.isIP(host)) {
    addresses = [host]
  } else {
    try {
      addresses = await (options.resolveHost ?? resolvePublicHost)(host)
    } catch {
      return fail('fetch_failed')
    }
    if (addresses.length === 0) return fail('fetch_failed')
  }
  const allowed = (address: string) =>
    isPublicAddress(address) || options.allowAddress?.(address) === true
  if (!addresses.every(allowed)) return fail('url_not_allowed')

  const address = addresses[0] as string
  const family = net.isIPv6(address) ? 6 : 4
  const lookup: net.LookupFunction = (_host, lookupOptions, callback) => {
    if (lookupOptions.all) callback(null, [{ address, family }])
    else
      (callback as (e: null, a: string, f: number) => void)(
        null,
        address,
        family,
      )
  }

  return new Promise<Answer | Failure>((resolve, reject) => {
    const transport = target.protocol === 'https:' ? https : http
    const request = transport.request(
      {
        host,
        port: target.port === '' ? undefined : Number(target.port),
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        lookup,
        agent: false,
        headers: {
          'user-agent': options.userAgent ?? 'TripBoard/0.1',
          accept: 'image/*',
          // Host header keeps the original name for virtual hosts.
          host: target.host,
        },
      },
      (response) => {
        const status = response.statusCode ?? 0
        const rawLocation = response.headers.location
        const location = typeof rawLocation === 'string' ? rawLocation : null
        if (status < 200 || status > 299) {
          response.resume()
          resolve({ status, location, body: Buffer.alloc(0) })
          return
        }
        const declared = Number(response.headers['content-length'])
        if (Number.isFinite(declared) && declared > maxBytes) {
          request.destroy()
          resolve(fail('too_large'))
          return
        }
        const chunks: Buffer[] = []
        let total = 0
        response.on('data', (chunk: Buffer) => {
          total += chunk.length
          if (total > maxBytes) {
            request.destroy()
            resolve(fail('too_large'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () =>
          resolve({ status, location, body: Buffer.concat(chunks) }),
        )
        response.on('error', reject)
      },
    )
    setAbort(() => {
      request.destroy()
      reject(new Error('aborted'))
    })
    request.on('error', reject)
    request.end()
  })
}

async function resolvePublicHost(host: string): Promise<string[]> {
  const found = await dnsLookup(host, { all: true, verbatim: true })
  return found.map((entry) => entry.address)
}

/** True for addresses on the public internet (R-34-04). */
export function isPublicAddress(address: string): boolean {
  if (net.isIPv4(address)) return isPublicV4(address.split('.').map(Number))
  if (net.isIPv6(address)) return isPublicV6(address)
  return false
}

function isPublicV4(p: number[]): boolean {
  const [a, b, c] = p as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return false
  if (a >= 224) return false // multicast, reserved, broadcast
  if (a === 100 && b >= 64 && b <= 127) return false // CGNAT
  if (a === 169 && b === 254) return false // link-local, metadata
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 192 && b === 88 && c === 99) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function isPublicV6(address: string): boolean {
  const groups = expandV6(address)
  if (!groups) return false
  const embedded = (hi: number, lo: number) =>
    isPublicV4([hi >> 8, hi & 255, lo >> 8, lo & 255])
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as number[] as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  // ::ffff:a.b.c.d (IPv4-mapped) is only as public as the IPv4 address.
  if (
    g0 === 0 &&
    g1 === 0 &&
    g2 === 0 &&
    g3 === 0 &&
    g4 === 0 &&
    g5 === 0xffff
  ) {
    return embedded(g6, g7)
  }
  // Only global unicast 2000::/3; this drops ::, ::1, fc00::/7, fe80::/10, ff00::/8.
  if ((g0 & 0xe000) !== 0x2000) return false
  if (g0 === 0x2001 && (g1 === 0x0db8 || g1 === 0)) return false // docs, Teredo
  if (g0 === 0x2002) return embedded(g1, g2) // 6to4
  return true
}

function expandV6(address: string): number[] | null {
  let text = address.toLowerCase()
  const zone = text.indexOf('%')
  if (zone >= 0) text = text.slice(0, zone)
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (tail) {
    const v4 = (tail[1] as string).split('.').map(Number)
    const hi = (((v4[0] as number) << 8) | (v4[1] as number)).toString(16)
    const lo = (((v4[2] as number) << 8) | (v4[3] as number)).toString(16)
    text = `${text.slice(0, text.length - (tail[1] as string).length)}${hi}:${lo}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const all = [
    ...head,
    ...Array<string>(halves.length === 2 ? missing : 0).fill('0'),
    ...rest,
  ]
  const numbers = all.map((part) => Number.parseInt(part, 16))
  return numbers.length === 8 && numbers.every((n) => n >= 0 && n <= 0xffff)
    ? numbers
    : null
}
