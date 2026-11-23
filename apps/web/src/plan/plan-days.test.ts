import { planDays, type PlanEntry, type PlanLink } from '@tripboard/shared'
import { describe, expect, it } from 'vitest'

let counter = 0
function uuid(prefix: string): string {
  counter += 1
  return `${prefix}-0000-4000-8000-${String(counter).padStart(12, '0')}`
}

function link(
  spotId: string,
  visitDate: string | null,
  visitTime: string | null,
  sortOrder: number,
): PlanLink {
  return {
    id: uuid('40000000'),
    spotId,
    title: `Spot ${spotId.slice(-2)}`,
    visitDate,
    visitTime,
    info: null,
    sortOrder,
  }
}

function entry(
  type: 'bucket' | 'single',
  startDate: string,
  endDate: string | null,
  spots: PlanLink[],
): PlanEntry {
  return {
    id: uuid('30000000'),
    tripId: '10000000-0000-4000-8000-000000000001',
    type,
    title: `${type} ${startDate}`,
    startDate,
    endDate,
    startTime: null,
    endTime: null,
    info: null,
    sortOrder: 0,
    outsideTripDates: false,
    home: null,
    spots,
  }
}

const a = '20000000-0000-4000-8000-0000000000aa'
const b = '20000000-0000-4000-8000-0000000000bb'
const c = '20000000-0000-4000-8000-0000000000cc'

describe('planDays', () => {
  it('T-46-01 turns two buckets and a single into days with colours, day order, repeats and any-day lists', () => {
    const evening = link(a, '2026-04-13', '18:00', 0)
    const morning = link(b, '2026-04-13', '09:00', 3)
    const untimedLate = link(c, '2026-04-13', null, 2)
    const untimedEarly = link(a, '2026-04-13', null, 1)
    const undated = link(b, null, null, 4)
    const tokyo = entry('bucket', '2026-04-12', '2026-04-16', [
      evening,
      untimedEarly,
      untimedLate,
      morning,
      undated,
    ])
    const ninth = link(c, '2026-04-20', null, 0)
    const kyoto = entry('bucket', '2026-04-17', '2026-04-21', [ninth])
    const arrival = link(b, '2026-04-12', '15:00', 0)
    const single = entry('single', '2026-04-12', null, [arrival])

    const result = planDays([tokyo, kyoto, single], {
      tripStart: '2026-04-12',
    })

    expect(result.days.map((day) => day.date)).toEqual([
      '2026-04-12',
      '2026-04-13',
      '2026-04-20',
    ])
    expect(result.days.map((day) => day.dayNumber)).toEqual([1, 2, 9])
    // Day 9 cycles back to the first colour.
    expect(result.days.map((day) => day.colorIndex)).toEqual([0, 1, 0])

    const monday = result.days[1]
    // 18:00 after 09:00 although its sort_order is lower; untimed follow in sort_order.
    expect(monday?.stops.map((stop) => stop.linkId)).toEqual([
      morning.id,
      evening.id,
      untimedEarly.id,
      untimedLate.id,
    ])
    expect(monday?.stops.map((stop) => stop.stopNumber)).toEqual([1, 2, 3, 4])
    // The same spot twice on one day is two stops.
    expect(
      monday?.stops
        .filter((stop) => stop.spotId === a)
        .map((s) => s.stopNumber),
    ).toEqual([2, 3])
    expect(monday?.stops[0]).toMatchObject({
      entryId: tokyo.id,
      spotId: b,
      linkId: morning.id,
    })

    expect(result.days[0]?.stops[0]).toMatchObject({
      entryId: single.id,
      stopNumber: 1,
    })
    expect(result.anyDay[tokyo.id]?.map((item) => item.id)).toEqual([
      undated.id,
    ])
    expect(result.anyDay[kyoto.id]).toBeUndefined()
  })

  it('T-46-01 a trip without dates counts from the first dated visit', () => {
    const first = link(a, '2026-05-03', null, 0)
    const later = link(b, '2026-05-05', null, 1)
    const trip = entry('bucket', '2026-05-01', '2026-05-10', [later, first])

    const result = planDays([trip], { tripStart: null })

    expect(
      result.days.map((day) => [day.date, day.dayNumber, day.colorIndex]),
    ).toEqual([
      ['2026-05-03', 1, 0],
      ['2026-05-05', 3, 2],
    ])
  })

  it('T-46-01 untimed visits of two entries on one day tie-break by the entry start', () => {
    const late = link(a, '2026-04-14', null, 0)
    const early = link(b, '2026-04-14', null, 0)
    const lateEntry = entry('single', '2026-04-14', null, [late])
    const earlyEntry = entry('bucket', '2026-04-12', '2026-04-16', [early])

    const result = planDays([lateEntry, earlyEntry])

    expect(result.days[0]?.stops.map((stop) => stop.linkId)).toEqual([
      early.id,
      late.id,
    ])
  })
})
