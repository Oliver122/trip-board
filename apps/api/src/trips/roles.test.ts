import type { TripRole } from '@tripboard/shared'
import { describe, expect, it } from 'vitest'
import { decideTripAccess } from './roles.js'

const roles = [
  'visitor',
  'planner',
  'owner',
] as const satisfies readonly TripRole[]

const allowed: Record<TripRole, Record<TripRole, boolean>> = {
  visitor: { visitor: true, planner: false, owner: false },
  planner: { visitor: true, planner: true, owner: false },
  owner: { visitor: true, planner: true, owner: true },
}

describe('trip role guard', () => {
  it('T-04-07 allows a role only when it meets the minimum', () => {
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
