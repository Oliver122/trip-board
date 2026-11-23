import { describe, expect, it } from 'vitest'
import type { PlanMapDay, PlanMapStop } from '../trips/trip-context'
import { dayBounds, dayCentroid, dayLine, stopOffsets } from './plan-geojson'

function stop(n: number, lng: number, lat: number, id = `l${n}`): PlanMapStop {
  return {
    linkId: id,
    entryId: 'e',
    spotId: `s${n}`,
    title: `Spot ${n}`,
    stopNumber: n,
    lng,
    lat,
  }
}

function day(date: string, stops: PlanMapStop[]): PlanMapDay {
  return { date, label: date, colorIndex: 0, stops }
}

describe('plan geojson', () => {
  it('T-46-05 joins a day in stop order and draws no line for one stop', () => {
    const line = dayLine(day('2026-04-13', [stop(1, 1, 2), stop(2, 3, 4)]))
    expect(line.features[0]?.geometry.coordinates).toEqual([
      [1, 2],
      [3, 4],
    ])
    expect(dayLine(day('2026-04-14', [stop(1, 1, 2)])).features).toEqual([])
  })

  it('T-46-06 anchors a card at the centroid of the stops', () => {
    expect(dayCentroid([stop(1, 0, 0), stop(2, 2, 4)])).toEqual({
      lng: 1,
      lat: 2,
    })
  })

  it('T-46-07 fits a day to its stops', () => {
    expect(dayBounds([stop(1, 1, 5), stop(2, 3, 2)])).toEqual({
      minLng: 1,
      minLat: 2,
      maxLng: 3,
      maxLat: 5,
    })
    expect(dayBounds([])).toBeNull()
  })

  it('T-46-05 spreads stops on identical coordinates and leaves others alone', () => {
    const offsets = stopOffsets([
      day('2026-04-13', [stop(1, 1, 1), stop(2, 5, 5)]),
      day('2026-04-14', [stop(1, 1, 1, 'again')]),
    ])
    expect(offsets.get('l2')).toEqual([0, 0])
    const a = offsets.get('l1')
    const b = offsets.get('again')
    expect(a).not.toEqual([0, 0])
    expect(a).not.toEqual(b)
  })
})
