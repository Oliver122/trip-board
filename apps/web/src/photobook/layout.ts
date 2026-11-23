// Justified collage (R-47-06): rows of about `target` px, aspect ratios kept,
// every row but the last filling the width. Pure, so it is unit-tested.

type CollageItem = { id: string; ratio: number }

type CollageCell = { id: string; width: number; height: number }

type CollageRow = { height: number; cells: CollageCell[] }

export const collageGap = 4

function rowHeight(
  sumRatio: number,
  count: number,
  width: number,
  gap: number,
) {
  return (width - gap * (count - 1)) / sumRatio
}

export function layoutCollage(
  items: CollageItem[],
  width: number,
  target: number,
  gap = collageGap,
): CollageRow[] {
  if (width <= 0 || target <= 0) return []
  const rows: CollageRow[] = []
  let row: CollageItem[] = []
  let sum = 0

  const flush = (stretch: boolean) => {
    if (row.length === 0) return
    const height = stretch ? rowHeight(sum, row.length, width, gap) : target
    const used = width - gap * (row.length - 1)
    let left = stretch ? used : Infinity
    const cells = row.map((item, index) => {
      const last = index === row.length - 1
      const cell = Math.min(
        left,
        last && stretch ? left : Math.floor(item.ratio * height),
      )
      left -= cell
      return { id: item.id, width: cell, height: Math.round(height) }
    })
    rows.push({ height: Math.round(height), cells })
    row = []
    sum = 0
  }

  // Invariant: the open row is taller than `target` at full width.
  for (const item of items) {
    const ratio = item.ratio > 0 ? item.ratio : 1
    if (row.length > 0) {
      const heightWith = rowHeight(sum + ratio, row.length + 1, width, gap)
      if (heightWith <= target) {
        const heightWithout = rowHeight(sum, row.length, width, gap)
        if (target - heightWith <= heightWithout - target) {
          row.push({ id: item.id, ratio })
          sum += ratio
          flush(true)
          continue
        }
        flush(true)
      }
    }
    row.push({ id: item.id, ratio })
    sum += ratio
    // A lone wide photo already fills the row.
    if (row.length === 1 && rowHeight(sum, 1, width, gap) <= target) flush(true)
  }
  flush(false)
  return rows
}
