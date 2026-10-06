import { randomInt } from 'node:crypto'

/** Crockford base32 without the look-alikes 0, O, 1, and I (L and U are already out). */
const crockford = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

export const inviteTtlMs = 7 * 24 * 60 * 60 * 1000

/** First three letters or digits of the trip name, padded when the name is shorter. */
export function invitePrefix(name: string): string {
  const chars = name.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return `${chars}XXX`.slice(0, 3)
}

export function inviteSuffix(): string {
  let suffix = ''
  for (let index = 0; index < 4; index += 1) {
    suffix += crockford[randomInt(crockford.length)]
  }
  return suffix
}
