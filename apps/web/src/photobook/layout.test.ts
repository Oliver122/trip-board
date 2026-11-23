import { describe, expect, it } from 'vitest'
import { collageGap, layoutCollage } from './layout'

const ratios = [1.5, 0.75, 1.33, 1, 1.78, 0.67, 1.5, 1, 1.2, 0.8, 1.6]
const items = ratios.map((ratio, index) => ({ id: `p${index}`, ratio }))

// T-47-05 (R-47-06: the collage layout of a day page)
describe('collage layout', () => {
  const width = 600
  const target = 160
  const rows = layoutCollage(items, width, target)

  it('R-47-06 puts every photo in exactly one cell, in order', () => {
    expect(rows.flatMap((row) => row.cells.map((cell) => cell.id))).toEqual(
      items.map((item) => item.id),
    )
  })

  it('R-47-06 makes the rows about the target height', () => {
    for (const row of rows.slice(0, -1)) {
      expect(row.height).toBeGreaterThan(target * 0.6)
      expect(row.height).toBeLessThan(target * 1.4)
    }
    expect(rows[rows.length - 1]?.height).toBe(target)
  })

  it('R-47-06 fills the width in every row but the last', () => {
    for (const row of rows.slice(0, -1)) {
      const sum = row.cells.reduce((total, cell) => total + cell.width, 0)
      expect(sum + collageGap * (row.cells.length - 1)).toBe(width)
    }
    const last = rows[rows.length - 1]
    const lastSum = last?.cells.reduce((total, cell) => total + cell.width, 0)
    expect(
      (lastSum ?? 0) + collageGap * ((last?.cells.length ?? 1) - 1),
    ).toBeLessThanOrEqual(width)
  })

  it('R-47-06 keeps each photo’s aspect ratio', () => {
    for (const row of rows) {
      for (const cell of row.cells) {
        const ratio = items.find((item) => item.id === cell.id)?.ratio ?? 1
        // Widths are whole pixels, the last cell of a row takes the remainder.
        expect(Math.abs(cell.width / cell.height - ratio)).toBeLessThan(0.08)
      }
    }
  })

  it('R-47-06 gives a lone wide photo a row of its own, shorter than the target', () => {
    const [row] = layoutCollage([{ id: 'wide', ratio: 5 }], 600, 160)
    expect(row?.cells).toHaveLength(1)
    expect(row?.cells[0]?.width).toBe(600)
    expect(row?.height).toBe(120)
  })

  it('R-47-06 lays out nothing without a width', () => {
    expect(layoutCollage(items, 0, 160)).toEqual([])
  })
})
