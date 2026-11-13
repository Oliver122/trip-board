import { describe, expect, it } from 'vitest'
import { JoinLimiter } from '../members/limit.js'
import { UploadLimiter } from '../images/limit.js'
import { RequestLimiter } from './limit.js'

describe('UploadLimiter refund', () => {
  it('T-44-03 refund removes the newest hit so a failed decode does not count', () => {
    const limiter = new UploadLimiter()
    for (let i = 0; i < 30; i++) expect(limiter.allow('u', at(0))).toBe(true)
    expect(limiter.allow('u', at(1))).toBe(false)
    limiter.refund('u')
    expect(limiter.allow('u', at(1))).toBe(true)
    expect(limiter.allow('u', at(1))).toBe(false)
    limiter.refund('nobody')
  })
})

const t0 = new Date('2026-06-01T00:00:00.000Z').getTime()
const at = (seconds: number) => new Date(t0 + seconds * 1000)

type Case = {
  name: string
  limit: number
  make: () => {
    hit: (key: string, now: Date) => boolean
    size: () => number
  }
}

const cases: Case[] = [
  {
    name: 'RequestLimiter',
    limit: 300,
    make: () => {
      const limiter = new RequestLimiter()
      return {
        hit: (key, now) => limiter.check(key, now).ok,
        size: () => limiter.size(),
      }
    },
  },
  {
    name: 'UploadLimiter',
    limit: 30,
    make: () => {
      const limiter = new UploadLimiter()
      return {
        hit: (key, now) => limiter.allow(key, now),
        size: () => limiter.size(),
      }
    },
  },
  {
    name: 'JoinLimiter',
    limit: 10,
    make: () => {
      const limiter = new JoinLimiter()
      return {
        hit: (key, now) => limiter.allow(key, now),
        size: () => limiter.size(),
      }
    },
  },
]

describe.each(cases)('$name', ({ name, limit, make }) => {
  it(`T-44-03 ${name} evicts stale keys on the first call after a window`, () => {
    const limiter = make()
    for (let i = 0; i < 10_000; i++) limiter.hit(`key-${i}`, at(0))
    expect(limiter.size()).toBe(10_000)

    limiter.hit('sweeper', at(61))
    expect(limiter.size()).toBeLessThanOrEqual(2)
  })

  it(`T-44-03 ${name} keeps a key hit 30 s before the sweep`, () => {
    const limiter = make()
    limiter.hit('old', at(0))
    limiter.hit('recent', at(31))
    limiter.hit('sweeper', at(61))
    expect(limiter.size()).toBe(2)
  })

  it(`T-44-03 ${name} still passes the last request of a window and refuses the next`, () => {
    const limiter = make()
    for (let i = 1; i <= limit; i++) {
      expect(limiter.hit('same', at(0))).toBe(true)
    }
    expect(limiter.hit('same', at(1))).toBe(false)
  })
})
