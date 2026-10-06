import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'
const japan = { minLng: 122.9, minLat: 24, maxLng: 153.9, maxLat: 45.6 }

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, '100000000000000001')
  await setLocale(page, 'en')
})

test('T-05-02 T-05-03 T-05-06 the Japan board fits the region', async ({
  page,
}) => {
  await page.goto(japanTrip)
  await expect(
    page.getByRole('heading', { name: 'Things to do' }),
  ).toBeVisible()
  await expect(page.getByTestId('add-new')).toBeVisible()
  const list = await page.getByTestId('spot-list').boundingBox()
  expect(list?.width).toBeCloseTo(360, 0)
  await expect(page.getByRole('link', { name: 'OpenStreetMap' })).toBeVisible()
  await waitForJapan(page)
  await expectNoSeriousViolations(page)
  await expect(page).toHaveScreenshot('board-1280.png', {
    mask: [page.locator('.maplibregl-canvas')],
    animations: 'disabled',
  })

  await page.setViewportSize({ width: 768, height: 1024 })
  const image = await page.screenshot()
  await test
    .info()
    .attach('board-768', { body: image, contentType: 'image/png' })
})

test('T-05-05 German labels use name:de', async ({ page }) => {
  await page.goto(japanTrip)
  await waitForJapan(page)
  await page.getByRole('button', { name: 'DE', exact: true }).click()
  await expect.poll(async () => labelField(page)).toContain('name:de')
})

test('T-05-08 a reload keeps the panned view', async ({ page }) => {
  await page.goto(japanTrip)
  await waitForJapan(page)
  const before = await page.evaluate(() => location.hash)
  await page.evaluate(() => {
    const map = window.__tripboardMap
    if (!map) throw new Error('map missing')
    map.panBy([160, 40], { duration: 0 })
  })
  await expect
    .poll(async () => page.evaluate(() => location.hash))
    .not.toBe(before)
  const hash = await page.evaluate(() => location.hash)
  const center = await page.evaluate(() => {
    const point = window.__tripboardMap?.getCenter()
    return {
      lng: point?.lng ?? 0,
      lat: point?.lat ?? 0,
      zoom: window.__tripboardMap?.getZoom() ?? 0,
    }
  })
  await page.reload()
  await waitForJapan(page)
  await expect.poll(async () => page.evaluate(() => location.hash)).toBe(hash)
  const after = await page.evaluate(() => {
    const point = window.__tripboardMap?.getCenter()
    return {
      lng: point?.lng ?? 0,
      lat: point?.lat ?? 0,
      zoom: window.__tripboardMap?.getZoom() ?? 0,
    }
  })
  expect(after.lng).toBeCloseTo(center.lng, 3)
  expect(after.lat).toBeCloseTo(center.lat, 3)
  expect(after.zoom).toBeCloseTo(center.zoom, 1)
})

test('T-05-07 a blocked tile request shows a banner and leaves the page usable', async ({
  page,
}) => {
  await page.route('**://tiles.openfreemap.org/**', (route) => route.abort())
  await page.goto(japanTrip)
  await expect(page.getByTestId('tile-error')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Things to do' }),
  ).toBeVisible()
  await expect(page.getByTestId('add-new')).toBeVisible()
  await page.getByTestId('add-new').click()
  await expect(
    page.getByRole('heading', { name: 'Things to do' }),
  ).toBeVisible()
})

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

async function setLocale(page: Page, locale: 'en' | 'de') {
  await page.evaluate(async (next) => {
    const response = await fetch('/api/me', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    })
    if (!response.ok) throw new Error(await response.text())
  }, locale)
}

async function waitForJapan(page: Page) {
  await page.waitForFunction(
    (box) => {
      const map = window.__tripboardMap
      if (!map) return false
      const center = map.getCenter()
      return (
        center.lng > box.minLng &&
        center.lng < box.maxLng &&
        center.lat > box.minLat &&
        center.lat < box.maxLat
      )
    },
    japan,
    { timeout: 20_000 },
  )
}

async function labelField(page: Page) {
  return page.evaluate(() => {
    try {
      const map = window.__tripboardMap
      const layer = map
        ?.getStyle()
        ?.layers?.find((item) => item.id === 'place-label')
      if (!layer || layer.type !== 'symbol') return ''
      return JSON.stringify(layer.layout?.['text-field'] ?? '')
    } catch {
      return ''
    }
  })
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious).toEqual([])
}

declare global {
  interface Window {
    __tripboardMap?: {
      getCenter: () => { lng: number; lat: number }
      getZoom: () => number
      panBy: (offset: [number, number], options?: { duration?: number }) => void
      getStyle: () => {
        layers?: Array<{
          id: string
          type: string
          layout?: { 'text-field'?: unknown }
        }>
      }
    }
  }
}
