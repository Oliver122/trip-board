import type { FastifyReply } from 'fastify'

export const tileOrigin = 'https://tiles.openfreemap.org'

/** Commons thumbnails in the suggestion strip (step 34). */
export const commonsImageOrigin = 'https://upload.wikimedia.org'

const hsts = 'max-age=15552000; includeSubDomains'

export function contentSecurityPolicy(blobOrigin: string): string {
  const images = [
    "'self'",
    'blob:',
    'data:',
    tileOrigin,
    commonsImageOrigin,
    blobOrigin,
  ]
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(' ')
  const connect = ["'self'", tileOrigin, blobOrigin]
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(' ')
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `img-src ${images}`,
    `connect-src ${connect}`,
    `font-src 'self' ${tileOrigin}`,
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
  ].join('; ')
}

export function applySecurityHeaders(
  reply: FastifyReply,
  options: { production: boolean; blobOrigin: string },
): void {
  reply.header(
    'content-security-policy',
    contentSecurityPolicy(options.blobOrigin),
  )
  reply.header('x-content-type-options', 'nosniff')
  reply.header('referrer-policy', 'strict-origin-when-cross-origin')
  if (options.production) reply.header('strict-transport-security', hsts)
}

export function blobOrigin(endpoint: string): string {
  return new URL(endpoint).origin
}
