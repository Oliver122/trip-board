import { describe, expect, it, vi } from 'vitest'
import { createEventBatcher, type LiveChange } from './events'

const spot = (id: string, clientId: string | null): LiveChange => ({
  resource: 'spot',
  id,
  action: 'spot.update',
  actorId: 'aiko',
  clientId,
})

describe('live event batch', () => {
  it('T-19-07 ignores this tab and refetches each resource once', () => {
    vi.useFakeTimers()
    const onFlush = vi.fn()
    const batcher = createEventBatcher({ clientId: 'me', onFlush })
    const events = [
      spot('1', 'me'),
      spot('2', 'aiko'),
      spot('3', null),
      { ...spot('4', 'aiko'), resource: 'plan', action: 'plan.update' },
      { ...spot('5', 'aiko'), resource: 'plan', action: 'plan.spot_add' },
    ]
    for (const event of events) batcher.push(event)
    expect(onFlush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(299)
    expect(onFlush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush.mock.calls[0]?.[0].resources).toEqual(['spot', 'plan'])
    expect(onFlush.mock.calls[0]?.[0].changes).toHaveLength(4)
    vi.useRealTimers()
  })
})
