import { createHmac, timingSafeEqual } from 'node:crypto'

export const signedUrlTtlSeconds = 10 * 60

export function signImagePath(id: string, secret: string, now: Date): string {
  const exp = Math.floor(now.getTime() / 1000) + signedUrlTtlSeconds
  const sig = signature(id, exp, secret)
  return `/images/${id}/file?exp=${exp}&sig=${sig}`
}

export function imageSignatureValid(
  id: string,
  exp: number,
  sig: string,
  secret: string,
  now: Date,
): boolean {
  if (!Number.isSafeInteger(exp)) return false
  if (exp <= Math.floor(now.getTime() / 1000)) return false
  const expected = signature(id, exp, secret)
  const left = Buffer.from(sig)
  const right = Buffer.from(expected)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function signature(id: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${id}.${exp}`).digest('base64url')
}
