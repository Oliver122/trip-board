export type CardBox = {
  id: string
  /** Left edge on screen, px. */
  x: number
  /** Top edge on screen, px, before any offset. */
  y: number
  width: number
  height: number
}

const gap = 6

/**
 * Vertical offsets (px) that move overlapping day cards apart so no two
 * boxes intersect (R-46-06). Cards are placed top to bottom; one that hits
 * an already placed card moves just below it. Cards that overlap nothing
 * keep offset 0.
 */
export function spreadCards(boxes: readonly CardBox[]): Record<string, number> {
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)
  const placed: CardBox[] = []
  const offsets: Record<string, number> = {}
  for (const box of sorted) {
    let y = box.y
    for (;;) {
      const hit = placed.find(
        (other) =>
          box.x < other.x + other.width &&
          other.x < box.x + box.width &&
          y < other.y + other.height + gap &&
          other.y < y + box.height + gap,
      )
      if (!hit) break
      y = hit.y + hit.height + gap
    }
    placed.push({ ...box, y })
    offsets[box.id] = y - box.y
  }
  return offsets
}
