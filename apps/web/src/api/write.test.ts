import { afterEach, describe, expect, it } from 'vitest'
import { clientId } from './write'

describe('clientId', () => {
  const original = crypto.randomUUID

  afterEach(() => {
    Object.defineProperty(crypto, 'randomUUID', {
      value: original,
      configurable: true,
    })
  })

  it('creates an id when randomUUID is unavailable', () => {
    Object.defineProperty(crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    })
    expect(clientId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})
