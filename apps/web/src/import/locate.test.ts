import { describe, expect, it } from 'vitest'
import { locateRows } from './locate'

function row(
  title: string,
  lat: number | null = null,
  lng: number | null = null,
) {
  return { title, address: null, lat, lng }
}

describe('locateRows', () => {
  it('T-23-05 calls the geocode client once per missing row, in order, never in parallel', async () => {
    const calls: string[] = []
    let concurrent = 0
    let maxConcurrent = 0
    const rows = [
      row('One'),
      row('Two'),
      row('Three'),
      row('Four'),
      row('Five'),
      row('Has coords', 10, 20),
    ]
    const controller = new AbortController()
    const search = async (query: string) => {
      concurrent += 1
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      calls.push(query)
      await Promise.resolve()
      concurrent -= 1
      return { lat: 1, lng: 2, label: 'Result' }
    }
    const progress: [number, number][] = []

    const results = await locateRows(
      rows,
      search,
      controller.signal,
      (done, total) => progress.push([done, total]),
    )

    expect(calls).toEqual(['One', 'Two', 'Three', 'Four', 'Five'])
    expect(maxConcurrent).toBe(1)
    expect(progress.at(-1)).toEqual([5, 5])
    expect(results.find((r) => r.title === 'Has coords')).toMatchObject({
      locationStatus: 'file',
      lat: 10,
      lng: 20,
    })
    expect(results[0]).toMatchObject({
      locationStatus: 'found',
      lat: 1,
      lng: 2,
    })
  })

  it('T-23-05 stops further calls once cancelled', async () => {
    const calls: string[] = []
    const controller = new AbortController()
    const rows = [
      row('One'),
      row('Two'),
      row('Three'),
      row('Four'),
      row('Five'),
    ]
    const search = async (query: string, signal: AbortSignal) => {
      calls.push(query)
      if (calls.length === 2) controller.abort()
      return signal.aborted ? null : { lat: 1, lng: 2, label: 'Result' }
    }

    const results = await locateRows(
      rows,
      search,
      controller.signal,
      () => undefined,
    )

    expect(calls).toEqual(['One', 'Two'])
    const notFound = results.filter((r) => r.locationStatus === 'not_found')
    expect(notFound).toHaveLength(4)
  })

  it('T-23-05 makes no call for a row that already has coordinates', async () => {
    const calls: string[] = []
    const controller = new AbortController()
    const search = async (query: string) => {
      calls.push(query)
      return { lat: 1, lng: 2, label: 'Result' }
    }
    const results = await locateRows(
      [row('Has it', 5, 6)],
      search,
      controller.signal,
      () => undefined,
    )
    expect(calls).toEqual([])
    expect(results[0]).toMatchObject({ locationStatus: 'file', lat: 5, lng: 6 })
  })
})
