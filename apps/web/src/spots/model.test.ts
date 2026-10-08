import { describe, expect, it } from 'vitest'
import { emptyDraft, switchDecision, type Draft } from './model'

const spotDraft: Draft = {
  ...emptyDraft,
  title: 'Fushimi Inari',
  lat: 34.97,
  lng: 135.77,
}

describe('switchDecision', () => {
  it('T-25-06 switches when the draft equals its baseline', () => {
    expect(
      switchDecision({ draft: spotDraft, baseline: spotDraft, saving: false }),
    ).toBe('switch')
    expect(
      switchDecision({
        draft: emptyDraft,
        baseline: emptyDraft,
        saving: false,
      }),
    ).toBe('switch')
  })

  it('T-25-06 confirms when an edit or add draft has changes', () => {
    expect(
      switchDecision({
        draft: { ...spotDraft, title: 'Changed' },
        baseline: spotDraft,
        saving: false,
      }),
    ).toBe('confirm')
    expect(
      switchDecision({
        draft: { ...emptyDraft, lat: 35, lng: 135 },
        baseline: emptyDraft,
        saving: false,
      }),
    ).toBe('confirm')
    expect(
      switchDecision({
        draft: { ...emptyDraft, title: 'Typed' },
        baseline: emptyDraft,
        saving: false,
      }),
    ).toBe('confirm')
  })

  it('T-25-06 ignores every switch while a save is in progress', () => {
    expect(
      switchDecision({ draft: spotDraft, baseline: spotDraft, saving: true }),
    ).toBe('ignore')
    expect(
      switchDecision({
        draft: { ...spotDraft, title: 'Changed' },
        baseline: spotDraft,
        saving: true,
      }),
    ).toBe('ignore')
  })
})
