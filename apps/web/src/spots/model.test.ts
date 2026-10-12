import { describe, expect, it } from 'vitest'
import {
  categoryCounts,
  collapseLabels,
  emptyDraft,
  switchDecision,
  type Draft,
} from './model'

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

describe('category filter helpers', () => {
  it('T-29-13 counts spots per kind, planned and home', () => {
    const spot = (
      kinds: string[],
      baseCategory: 'kind' | 'home',
      displayCategory: 'kind' | 'planned' | 'home',
    ) => ({
      kinds: kinds.map((id) => ({ id })),
      baseCategory,
      displayCategory,
    })
    const counts = categoryCounts([
      spot(['a', 'b'], 'kind', 'kind'),
      spot(['a'], 'kind', 'planned'),
      spot([], 'home', 'home'),
    ] as never)
    expect(counts).toEqual({ a: 2, b: 1, planned: 1, home: 1 })
  })

  it('T-29-13 collapses past three categories to "first +rest"', () => {
    expect(collapseLabels(['A', 'B', 'C'], 3)).toBeNull()
    expect(collapseLabels(['A', 'B', 'C', 'D'], 3)).toEqual({
      first: 'A',
      more: 3,
    })
  })
})
