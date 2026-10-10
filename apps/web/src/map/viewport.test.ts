import { describe, expect, it } from 'vitest'
import {
  formatViewportHash,
  initialViewport,
  parseViewportHash,
  rememberViewport,
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

  it('T-18-18 ignores a moveend that belongs to the other page', () => {
    const view = tokyo
    expect(
      rememberViewport({
        eventScope: 'schedule',
        activeScope: 'board',
        view,
        pathname: '/trips/1',
        search: '',
      }),
    ).toBeNull()
    expect(
      rememberViewport({
        eventScope: 'board',
        activeScope: 'schedule',
        view,
        pathname: '/trips/1/schedule',
        search: '',
      }),
    ).toBeNull()
    expect(
      rememberViewport({
        eventScope: 'board',
        activeScope: 'board',
        view,
        pathname: '/trips/1',
        search: '?q=cafe',
      }),
    ).toMatchObject({
      hash: '#11.00/35.68000/139.75000',
      url: '/trips/1?q=cafe#11.00/35.68000/139.75000',
      persistBoard: true,
    })
    expect(
      rememberViewport({
        eventScope: 'schedule',
        activeScope: 'schedule',
        view,
        pathname: '/trips/1/schedule',
        search: '',
      })?.hash.startsWith('#s/'),
    ).toBe(true)
  })

  it('writes no hash once the URL has left the scope page', () => {
    for (const pathname of ['/trips/1/settings', '/trips', '/account']) {
      expect(
        rememberViewport({
          eventScope: 'board',
          activeScope: 'board',
          view: tokyo,
          pathname,
          search: '',
        }),
      ).toBeNull()
    }
    expect(
      rememberViewport({
        eventScope: 'schedule',
        activeScope: 'schedule',
        view: tokyo,
        pathname: '/trips',
        search: '',
      }),
    ).toBeNull()
  })
})
