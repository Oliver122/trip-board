import { expect, test, type Page } from './fixtures'
import { waitForMapLoaded } from './map'
import { settle } from './settle'

const japanTrip = '10000000-0000-0000-0000-000000000001'
const sven = '100000000000000001'

type Point = { lng: number; lat: number }
type MapProbe = {
  getBounds: () => { contains: (point: [number, number]) => boolean }
  getZoom: () => number
  getCenter: () => Point
  cameraForBounds: (
    bounds: [[number, number], [number, number]],
    options: { padding: number },
  ) => { zoom?: number } | undefined
  loaded: () => boolean
}
type ProbeWindow = Window & { __tripboardMap?: MapProbe }

async function login(page: Page, discordId: string) {
  await page.goto('/login')
  await page.evaluate(async (id) => {
    const response = await fetch('/api/test/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ discordId: id }),
    })
    if (!response.ok) throw new Error(await response.text())
  }, discordId)
}

async function api<T>(page: Page, path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!response.ok) throw new Error(await response.text())
      return (await response.json()) as unknown
    },
    { path, body },
  ) as Promise<T>
}

async function createTrip(page: Page, name: string) {
  const trip = await api<{ id: string }>(page, '/api/trips', {
    name,
    timezone: 'Asia/Tokyo',
    region: { bbox: { minLng: 128, minLat: 30, maxLng: 146, maxLat: 45 } },
  })
  return trip.id
}

async function createSpot(
  page: Page,
  tripId: string,
  title: string,
  point: Point,
) {
  const spot = await api<{ id: string }>(page, `/api/trips/${tripId}/spots`, {
    title,
    lat: point.lat,
    lng: point.lng,
    baseCategory: 'maybe',
    address: title,
  })
  return spot.id
}

async function deleteTrip(page: Page, tripId: string) {
  await page.evaluate(async (id) => {
    await fetch(`/api/trips/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
  }, tripId)
}

async function visible(page: Page, point: Point) {
  return page.evaluate(
    (p) =>
      (window as ProbeWindow).__tripboardMap
        ?.getBounds()
        .contains([p.lng, p.lat]) ?? false,
    point,
  )
}

async function zoomOf(page: Page) {
  return page.evaluate(
    () => (window as ProbeWindow).__tripboardMap?.getZoom() ?? 0,
  )
}

async function regionZoom(page: Page, tripId: string) {
  const trip = await api<{
    region: {
      bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number }
    }
  }>(page, `/api/trips/${tripId}`)
  return page.evaluate((bbox) => {
    const camera = (window as ProbeWindow).__tripboardMap?.cameraForBounds(
      [
        [bbox.minLng, bbox.minLat],
        [bbox.maxLng, bbox.maxLat],
      ],
      { padding: 48 },
    )
    return camera?.zoom ?? 0
  }, trip.region.bbox)
}

const tokyo = { lng: 139.7, lat: 35.68 }
const kyoto = { lng: 135.77, lat: 35.01 }

test.describe('phone map', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('T-42-05 the board first view fits every spot, not the trip region', async ({
    page,
  }) => {
    await login(page, sven)
    const spots = await api<{ spots: { lng: number; lat: number }[] }>(
      page,
      `/api/trips/${japanTrip}/spots`,
    )
    expect(spots.spots.length).toBeGreaterThan(0)
    await page.goto(`/trips/${japanTrip}`)
    await waitForMapLoaded(page)
    await settle(page)
    for (const spot of spots.spots) {
      expect(await visible(page, spot)).toBe(true)
    }
    expect(await zoomOf(page)).toBeGreaterThan(
      await regionZoom(page, japanTrip),
    )
  })

  test('T-42-05 a view in the URL hash wins over fitting', async ({ page }) => {
    await login(page, sven)
    await page.goto(`/trips/${japanTrip}#5.00/36.00000/138.00000`)
    await waitForMapLoaded(page)
    await settle(page)
    expect(await zoomOf(page)).toBeCloseTo(5, 0)
  })

  test('T-42-05 a trip with no spots fits its region, and the schedule map frames the first entry', async ({
    page,
  }) => {
    await login(page, sven)
    const empty = await createTrip(page, 'Phone map empty')
    const filled = await createTrip(page, 'Phone map filled')
    try {
      await page.goto(`/trips/${empty}`)
      await waitForMapLoaded(page)
      await settle(page)
      for (const corner of [
        { lng: 128.5, lat: 30.5 },
        { lng: 145.5, lat: 44.5 },
      ]) {
        expect(await visible(page, corner)).toBe(true)
      }

      await createSpot(page, filled, 'Tokyo spot', tokyo)
      const kyotoId = await createSpot(page, filled, 'Kyoto spot', kyoto)
      const bucket = await api<{ id: string }>(
        page,
        `/api/trips/${filled}/plan`,
        {
          type: 'bucket',
          title: 'Kyoto days',
          startDate: '2026-04-12',
          endDate: '2026-04-14',
        },
      )
      await api(page, `/api/plan/${bucket.id}/spots`, {
        spotId: kyotoId,
        visitDate: '2026-04-12',
      })
      await page.goto(`/trips/${filled}/schedule`)
      await waitForMapLoaded(page)
      await settle(page)
      expect(await visible(page, kyoto)).toBe(true)
      expect(await zoomOf(page)).toBeGreaterThan(await regionZoom(page, filled))
    } finally {
      await deleteTrip(page, empty)
      await deleteTrip(page, filled)
    }
  })

  test('T-42-06 pins have a 44 px hit area around a 28 px drawing', async ({
    page,
  }) => {
    await login(page, sven)
    const tripId = await createTrip(page, 'Phone map pins')
    try {
      await createSpot(page, tripId, 'Tokyo spot', tokyo)
      await createSpot(page, tripId, 'Kyoto spot', kyoto)
      await page.goto(`/trips/${tripId}`)
      await waitForMapLoaded(page)
      await settle(page)
      const pins = page.locator(
        '[data-testid^="pin-"]:not([data-testid="draft-pin"])',
      )
      await expect(pins).toHaveCount(2)
      for (const pin of await pins.all()) {
        const box = await pin.boundingBox()
        expect(box?.width).toBeGreaterThanOrEqual(44)
        expect(box?.height).toBeGreaterThanOrEqual(44)
        const drawing = await pin.locator('[data-pin-drawing]').boundingBox()
        expect(drawing?.width).toBe(28)
        expect(drawing?.height).toBe(28)
        const centre = (
          b: { x: number; y: number; width: number; height: number } | null,
        ) => (b ? [b.x + b.width / 2, b.y + b.height / 2] : [])
        const [bx = 0, by = 0] = centre(box)
        const [dx = 0, dy = 0] = centre(drawing)
        expect(Math.abs(bx - dx)).toBeLessThanOrEqual(1)
        expect(Math.abs(by - dy)).toBeLessThanOrEqual(1)
      }
    } finally {
      await deleteTrip(page, tripId)
    }
  })
})

for (const width of [390, 768, 1280]) {
  test(`T-42-06 the attribution is free of Add new and the map controls at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await login(page, sven)
    await page.goto(`/trips/${japanTrip}`)
    await waitForMapLoaded(page)
    await settle(page)
    const map = page.getByRole('region', { name: 'Map' })
    const link = map.getByRole('link', { name: 'OpenFreeMap' })
    const credit = await link.boundingBox()
    expect(credit).not.toBeNull()
    const others = [
      page.getByTestId('add-new'),
      ...(await map
        .locator(
          'button:not([data-testid^="pin-"]):not([data-testid="cluster"])',
        )
        .all()),
    ]
    for (const other of others) {
      const box = await other.boundingBox()
      if (!box || !credit) continue
      const apart =
        box.x + box.width <= credit.x ||
        credit.x + credit.width <= box.x ||
        box.y + box.height <= credit.y ||
        credit.y + credit.height <= box.y
      expect(apart).toBe(true)
    }
  })
}
