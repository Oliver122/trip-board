import type { TripRole } from '@tripboard/shared'
import { describe, expect, it } from 'vitest'
import { decideTripAccess, parseTripRole, roleOrVisitor } from './roles.js'

describe('trip role parsing', () => {
  it('T-26-11 parseTripRole accepts known roles and rejects the rest', () => {
    expect(parseTripRole('owner')).toBe('owner')
    expect(parseTripRole('planner')).toBe('planner')
    expect(parseTripRole('visitor')).toBe('visitor')
    expect(parseTripRole('admin')).toBe('admin')
    expect(parseTripRole('superuser')).toBeNull()
    expect(parseTripRole('')).toBeNull()
    expect(parseTripRole(null)).toBeNull()
    expect(parseTripRole(undefined)).toBeNull()
  })

  it('T-26-11 roleOrVisitor falls back to visitor and warns on unknown values', () => {
    const warnings: string[] = []
    const log = { warn: (message: string) => warnings.push(message) }
    expect(roleOrVisitor('planner', log)).toBe('planner')
    expect(warnings).toEqual([])
    expect(roleOrVisitor('superuser', log)).toBe('visitor')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('superuser')
  })
})

const roles = [
  'visitor',
  'planner',
  'admin',
  'owner',
] as const satisfies readonly TripRole[]

const allowed: Record<TripRole, Record<TripRole, boolean>> = {
  visitor: { visitor: true, planner: false, admin: false, owner: false },
  planner: { visitor: true, planner: true, admin: false, owner: false },
  admin: { visitor: true, planner: true, admin: true, owner: false },
  owner: { visitor: true, planner: true, admin: true, owner: true },
}

describe('trip role guard', () => {
  it('T-04-07 T-28-01 allows a role only when it meets the minimum', () => {
    for (const actual of roles) {
      for (const min of roles) {
        expect(decideTripAccess(actual, min)).toBe(
          allowed[actual][min] ? 'allow' : 'deny',
        )
      }
    }
    for (const min of roles) {
      expect(decideTripAccess(null, min)).toBe('missing')
    }
  })
})
