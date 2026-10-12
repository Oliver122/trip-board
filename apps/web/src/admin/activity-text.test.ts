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
    count: 45,
    role: 'visitor',
    code: 'JPN-7K3Q',
    format: 'csv',
    locale: 'de',
    from: 'visitor',
    to: 'planner',
    name: 'Food',
    moved: 3,
    movedTo: 'Maybe',
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

  it('T-23-10 renders a spot.import sentence with the actor, count, and trip name', () => {
    const input = {
      action: 'spot.import',
      actorName: 'aiko',
      tripName: 'Japan 2026',
      metadata: { count: 45, trip: 'Japan 2026' },
    }
    expect(activitySentence(input, 'en')).toBe(
      'aiko imported 45 spots into Japan 2026',
    )
    expect(activitySentence(input, 'de')).toBe(
      'aiko hat 45 Spots in Japan 2026 importiert',
    )
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

describe('kind activity sentences', () => {
  it('T-28-20 names the actor, kind and trip for every kind action in en and de', () => {
    const metadata = { trip: 'Japan 2026', name: 'Food' }
    expect(
      activitySentence(
        { action: 'kind.create', actorName: 'aiko', metadata },
        'en',
      ),
    ).toBe('aiko added the kind Food to Japan 2026')
    for (const action of ['create', 'update', 'delete']) {
      const de = activitySentence(
        { action: `kind.${action}`, actorName: 'aiko', metadata },
        'de',
      )
      expect(de).toContain('aiko')
      expect(de).toContain('Food')
    }
    expect(
      activitySentence(
        { action: 'kind.reorder', actorName: 'aiko', metadata },
        'en',
      ),
    ).toBe('aiko reordered the kinds of Japan 2026')
  })

  it('names where the spots went when a deleted kind had spots', () => {
    const input = {
      action: 'kind.delete',
      actorName: 'aiko',
      metadata: {
        trip: 'Japan 2026',
        name: 'Food',
        moved: 3,
        movedTo: 'Maybe',
      },
    }
    expect(activitySentence(input, 'en')).toBe(
      'aiko deleted the kind Food from Japan 2026 and moved 3 spots to Maybe',
    )
    expect(activitySentence(input, 'de')).toContain('Maybe')
  })
})

describe('kind limit activity sentences', () => {
  it('T-29-23 names the actor, count and trip for kind.limit_request in en and de', () => {
    const input = {
      action: 'kind.limit_request',
      actorName: 'aiko',
      tripName: 'Japan 2026',
      metadata: { count: 20, trip: 'Japan 2026' },
    }
    expect(activitySentence(input, 'en')).toBe(
      'aiko requested 20 kinds for Japan 2026',
    )
    expect(activitySentence(input, 'de')).toContain('20')
    expect(activitySentence(input, 'de')).not.toBe(
      activitySentence(input, 'en'),
    )
  })
})
