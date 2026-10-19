import type { Browser } from '@playwright/test'
import { expect, test, type Page } from './fixtures'
import { waitForMap } from './map'

async function api(
  page: Page,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ id: string }> {
  return page.evaluate(
    async ({ method: m, url: u, body: b }) => {
      const response = await fetch(u, {
        method: m,
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: b === undefined ? undefined : JSON.stringify(b),
      })
      if (!response.ok) throw new Error(await response.text())
      return (await response.json()) as { id: string }
    },
    { method, url, body },
  )
}

async function login(page: Page, discordId = '100000000000000002') {
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

async function createTrip(page: Page, name: string) {
  const trip = await api(page, 'POST', '/api/trips', {
    name,
    timezone: 'Asia/Tokyo',
    region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
  })
  return trip.id
}

async function createSpot(
  page: Page,
  tripId: string,
  title: string,
  extra: Record<string, unknown> = {},
) {
  const spot = await api(page, 'POST', `/api/trips/${tripId}/spots`, {
    title,
    lat: 34.2 + Math.random() * 1.6,
    lng: 135.5 + Math.random() * 4,
    baseCategory: 'maybe',
    address: 'Japan',
    ...extra,
  })
  return spot.id
}

async function mapView(page: Page) {
  return page.evaluate(() => {
    const map = (
      window as unknown as {
        __tripboardMap?: {
          getCenter: () => { lng: number; lat: number }
          getZoom: () => number
        }
      }
    ).__tripboardMap
    if (!map) return { lng: 0, lat: 0, zoom: 0 }
    const center = map.getCenter()
    return { lng: center.lng, lat: center.lat, zoom: map.getZoom() }
  })
}

/** The map view once it stops moving (opening a spot flies the map to it). */
async function stableMapView(page: Page) {
  let last = await mapView(page)
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(300)
        const next = await mapView(page)
        const same = JSON.stringify(next) === JSON.stringify(last)
        last = next
        return same
      },
      { timeout: 15_000 },
    )
    .toBe(true)
  return last
}

const docTop = (page: Page) =>
  page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)

async function wheelOver(
  page: Page,
  target: ReturnType<Page['locator']>,
  deltaY: number,
) {
  const box = await target.boundingBox()
  if (!box) throw new Error('no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let done = 0; done < Math.abs(deltaY); done += 200) {
    await page.mouse.wheel(0, Math.sign(deltaY) * 200)
  }
  await page.waitForTimeout(150)
}

const scrollTop = (target: ReturnType<Page['locator']>) =>
  target.evaluate((element) => element.scrollTop)

test('T-31-01 wheel over the spot list scrolls only the list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  const tripId = await createTrip(page, 'Scroll list')
  for (let index = 0; index < 30; index += 1) {
    await createSpot(page, tripId, `Spot ${String(index).padStart(2, '0')}`)
  }
  await page.goto(`/trips/${tripId}`)
  await waitForMap(page)
  const list = page.getByTestId('spot-list-items')
  await expect(list.locator('li').first()).toBeVisible()
  const before = await stableMapView(page)

  await wheelOver(page, list, 2000)
  expect(await scrollTop(list)).toBeGreaterThan(0)
  expect(await docTop(page)).toBe(0)
  expect(await mapView(page)).toEqual(before)

  await wheelOver(page, list, -4000)
  expect(await scrollTop(list)).toBe(0)
  expect(await docTop(page)).toBe(0)
  expect(await mapView(page)).toEqual(before)
})

const SVEN = '100000000000000001'
const AIKO = '100000000000000002'
const TOM = '100000000000000003'

/** Comments are limited to 20 per user per minute: spread 20 over 3 members. */
async function seedComments(
  browser: Browser,
  page: Page,
  tripId: string,
  spotId: string,
) {
  const codes = await page.evaluate(async (id) => {
    const out: string[] = []
    for (let index = 0; index < 2; index += 1) {
      const response = await fetch(`/api/trips/${id}/invites`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'planner' }),
      })
      if (!response.ok) throw new Error(await response.text())
      out.push(((await response.json()) as { code: string }).code)
    }
    return out
  }, tripId)
  const remark = 'A long remark about this place. '.repeat(8)
  const post = async (author: Page, from: number, to: number) => {
    for (let index = from; index < to; index += 1) {
      await api(author, 'POST', `/api/spots/${spotId}/comments`, {
        body: `Comment number ${index}. ${remark}`,
      })
    }
  }
  await post(page, 0, 7)
  const plan: [string, string, number, number][] = [
    [AIKO, codes[0] ?? '', 7, 14],
    [TOM, codes[1] ?? '', 14, 20],
  ]
  for (const [discordId, code, from, to] of plan) {
    const context = await browser.newContext()
    const member = await context.newPage()
    await login(member, discordId)
    await member.evaluate(async (invite) => {
      const response = await fetch(`/api/join/${invite}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error(await response.text())
    }, code)
    await post(member, from, to)
    await context.close()
  }
}

test.describe('T-31-02 spot panel', () => {
  // One trip, one spot and 20 comments for both widths: the comment limit is
  // per user per minute, so seeding twice in parallel would flake.
  test.describe.configure({ mode: 'serial' })
  let tripId = ''
  let spotId = ''

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await login(page, SVEN)
    tripId = await createTrip(page, `Scroll panel ${Date.now().toString(36)}`)
    spotId = await createSpot(page, tripId, 'Long spot', {
      info: 'Lorem ipsum dolor sit amet. '.repeat(70).slice(0, 2000),
    })
    await seedComments(browser, page, tripId, spotId)
    await context.close()
  })

  for (const width of [1280, 768]) {
    test(`T-31-02 wheel over the spot panel scrolls only its body at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 })
      await login(page, SVEN)
      await page.goto(`/trips/${tripId}`)
      await waitForMap(page)
      await page.getByTestId(`card-${spotId}`).click()
      const panel = page.getByRole('dialog')
      await expect(panel).toBeVisible()
      const body = panel.locator('[data-modal-body]')
      await expect(body).toBeVisible()
      // Opening the spot eases the map to zoom >= 12; on a slow browser that
      // can start after a first quiet sample, so wait for it to arrive.
      await expect
        .poll(async () => (await mapView(page)).zoom, { timeout: 15_000 })
        .toBeGreaterThanOrEqual(12)
      const before = await stableMapView(page)

      const header = panel.locator('h2')
      // Header wheel is forwarded to the body.
      await wheelOver(page, header, 400)
      expect(await scrollTop(body)).toBeGreaterThan(0)
      await wheelOver(page, header, -400)
      expect(await scrollTop(body)).toBe(0)

      const footer = panel.locator('[data-testid="spot-delete"], button').last()
      for (const target of [header, body, footer]) {
        await wheelOver(page, target, 3000)
        expect(await docTop(page)).toBe(0)
        expect(await mapView(page)).toEqual(before)
      }
      expect(await scrollTop(body)).toBeGreaterThan(0)
      for (const target of [footer, body, header]) {
        await wheelOver(page, target, -6000)
        expect(await docTop(page)).toBe(0)
        expect(await mapView(page)).toEqual(before)
      }
      expect(await scrollTop(body)).toBe(0)
    })
  }
})

test('T-31-03 wheel over the schedule list scrolls only the list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  const tripId = await createTrip(page, 'Scroll schedule')
  for (let index = 0; index < 12; index += 1) {
    const day = String(index + 1).padStart(2, '0')
    await api(page, 'POST', `/api/trips/${tripId}/plan`, {
      type: 'bucket',
      title: `Bucket ${index}`,
      startDate: `2026-04-${day}`,
      endDate: `2026-04-${day}`,
    })
  }
  await page.goto(`/trips/${tripId}/schedule`)
  await waitForMap(page)
  const scroll = page.getByTestId('schedule-scroll')
  await expect(scroll).toBeVisible()
  const before = await stableMapView(page)

  await wheelOver(page, scroll, 3000)
  expect(await scrollTop(scroll)).toBeGreaterThan(0)
  expect(await docTop(page)).toBe(0)
  expect(await mapView(page)).toEqual(before)

  await wheelOver(page, scroll, -6000)
  expect(await scrollTop(scroll)).toBe(0)
  expect(await docTop(page)).toBe(0)
  expect(await mapView(page)).toEqual(before)
})

test('T-31-04 wheel over the map still zooms it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  const tripId = await createTrip(page, 'Scroll map')
  await page.goto(`/trips/${tripId}`)
  await waitForMap(page)
  const before = await stableMapView(page)
  await page.mouse.move(300, 450)
  for (let index = 0; index < 5; index += 1) {
    await page.mouse.wheel(0, -200)
  }
  await expect
    .poll(async () => (await mapView(page)).zoom)
    .not.toBe(before.zoom)
  expect(await docTop(page)).toBe(0)
})
