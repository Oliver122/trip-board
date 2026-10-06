import { describe, expect, it } from 'vitest'
import { activityActions, activitySentence } from './activity-text'

const sample = {
  actorName: 'aiko',
  tripName: 'Japan 2026',
  metadata: {
    spot: 'Fushimi Inari',
    title: 'Shibuya Sky',
    trip: 'Japan 2026',
    plan: 'Tokyo',
    role: 'visitor',
    code: 'JPN-7K3Q',
    format: 'csv',
    locale: 'de',
    from: 'visitor',
    to: 'planner',
  },
}

describe('activity sentences', () => {
  it('T-17-05 has an English and German sentence for every logged action', () => {
    for (const action of activityActions) {
      const en = activitySentence({ action, ...sample }, 'en')
      const de = activitySentence({ action, ...sample }, 'de')
      expect(en).not.toBe(action)
      expect(de).not.toBe(action)
      expect(de).not.toBe(en)
    }
    expect(activitySentence({ action: 'mystery.action' }, 'en')).toBe(
      'mystery.action',
    )
    expect(
      activitySentence(
        {
          action: 'spot.create',
          actorName: 'aiko',
          tripName: 'Japan 2026',
          metadata: { spot: 'Fushimi Inari' },
        },
        'en',
      ),
    ).toBe('aiko added Fushimi Inari to Japan 2026')
  })
})
