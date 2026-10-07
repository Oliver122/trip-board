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

describe('comment activity sentences', () => {
  it('T-24-12 names the actor, spot and trip for create, update and delete in en and de', () => {
    const metadata = { trip: 'Japan 2026', spot: 'Fushimi Inari' }
    expect(
      activitySentence(
        { action: 'comment.create', actorName: 'aiko', metadata },
        'en',
      ),
    ).toBe('aiko commented on Fushimi Inari in Japan 2026')
    expect(
      activitySentence(
        { action: 'comment.update', actorName: 'aiko', metadata },
        'en',
      ),
    ).toBe('aiko edited a comment on Fushimi Inari in Japan 2026')
    expect(
      activitySentence(
        { action: 'comment.delete', actorName: 'sven', metadata },
        'en',
      ),
    ).toBe('sven deleted a comment on Fushimi Inari in Japan 2026')
    for (const action of ['create', 'update', 'delete']) {
      const de = activitySentence(
        { action: `comment.${action}`, actorName: 'aiko', metadata },
        'de',
      )
      expect(de).toContain('aiko')
      expect(de).toContain('Fushimi Inari')
      expect(de).toContain('Japan 2026')
    }
  })
})
