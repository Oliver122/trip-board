import { describe, expect, it } from 'vitest'
import { spreadCards, type CardBox } from './day-cards'

function intersects(a: CardBox, b: CardBox): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  )
}

describe('spreadCards', () => {
  it('T-46-06 keeps cards that do not overlap where they are', () => {
    const boxes: CardBox[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 60 },
      { id: 'b', x: 200, y: 0, width: 100, height: 60 },
      { id: 'c', x: 0, y: 200, width: 100, height: 60 },
    ]
    expect(spreadCards(boxes)).toEqual({ a: 0, b: 0, c: 0 })
  })

  it('T-46-06 moves overlapping cards apart so no two intersect', () => {
    const boxes: CardBox[] = [
      { id: 'a', x: 10, y: 10, width: 100, height: 60 },
      { id: 'b', x: 20, y: 20, width: 100, height: 60 },
      { id: 'c', x: 15, y: 30, width: 100, height: 60 },
      { id: 'd', x: 15, y: 30, width: 100, height: 60 },
    ]
    const offsets = spreadCards(boxes)
    const moved = boxes.map((box) => ({
      ...box,
      y: box.y + (offsets[box.id] ?? 0),
    }))
    for (let i = 0; i < moved.length; i++) {
      for (let j = i + 1; j < moved.length; j++) {
        expect(intersects(moved[i]!, moved[j]!)).toBe(false)
      }
    }
    expect(offsets.a).toBe(0)
  })
})
