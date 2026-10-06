import { describe, expect, it } from 'vitest'
import {
  formatViewportHash,
  initialViewport,
  parseViewportHash,
  type Viewport,
} from './viewport'

const tokyo: Viewport = { zoom: 11, lat: 35.68, lng: 139.75 }
const trip: Viewport = { zoom: 5, lat: 35, lng: 136 }

describe('map viewport', () => {
  it('keeps board and schedule hashes apart', () => {
    const board = formatViewportHash(tokyo, 'board')
    const schedule = formatViewportHash(trip, 'schedule')
    expect(board.startsWith('#s/')).toBe(false)
    expect(schedule.startsWith('#s/')).toBe(true)
    expect(parseViewportHash(board, 'board')).toMatchObject({
      zoom: 11,
      lat: 35.68,
      lng: 139.75,
    })
    expect(parseViewportHash(board, 'schedule')).toBeNull()
    expect(parseViewportHash(schedule, 'board')).toBeNull()
    expect(parseViewportHash(schedule, 'schedule')?.zoom).toBe(5)
  })

  it('restores the board only from its own hash or a schedule hash', () => {
    const board = formatViewportHash(tokyo, 'board')
    const schedule = formatViewportHash(trip, 'schedule')
    expect(initialViewport(board, 'board', trip)).toMatchObject({ zoom: 11 })
    expect(initialViewport(schedule, 'board', tokyo)).toEqual(
      expect.objectContaining({ zoom: 11, lng: 139.75 }),
    )
    expect(initialViewport('', 'board', tokyo)).toBeNull()
    expect(initialViewport(schedule, 'schedule', tokyo)?.zoom).toBe(5)
    expect(initialViewport(board, 'schedule', trip)).toBeNull()
  })
})
