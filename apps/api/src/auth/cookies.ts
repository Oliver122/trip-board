import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'tb_session'
export const OAUTH_COOKIE = 'tb_oauth'

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const SLIDE_IF_REMAINING_UNDER_MS = 15 * 24 * 60 * 60 * 1000
export const OAUTH_TTL_MS = 10 * 60 * 1000
export const SEEN_INTERVAL = '5 minutes'

export type OAuthState = {
  state: string
  verifier: string
  next: string
  exp: number
}

export function signOAuthState(payload: OAuthState, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function readOAuthState(
  value: string,
  secret: string,
  nowMs: number,
): OAuthState | null {
  const dot = value.indexOf('.')
  if (dot <= 0) return null
  const body = value.slice(0, dot)
  const mac = value.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const left = Buffer.from(mac)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString(),
    ) as OAuthState
    if (
      typeof payload.state !== 'string' ||
      typeof payload.verifier !== 'string' ||
      typeof payload.next !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= nowMs
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export function serializeCookie(
  name: string,
  value: string,
  options: { maxAge: number; secure: boolean },
): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAge}`,
  ]
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

export function sessionCookie(token: string, secure: boolean): string {
  return serializeCookie(SESSION_COOKIE, token, {
    maxAge: SESSION_TTL_MS / 1000,
    secure,
  })
}

export function oauthCookie(value: string, secure: boolean): string {
  return serializeCookie(OAUTH_COOKIE, value, {
    maxAge: OAUTH_TTL_MS / 1000,
    secure,
  })
}

export function clearCookie(name: string, secure: boolean): string {
  return serializeCookie(name, '', { maxAge: 0, secure })
}

export function readCookie(
  header: string | string[] | undefined,
  name: string,
): string | undefined {
  const raw = Array.isArray(header) ? header.join('; ') : header
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1)
  }
  return undefined
}
