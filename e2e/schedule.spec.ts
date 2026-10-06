import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'
const tokyoEntry = '30000000-0000-0000-0000-000000000001'
const shibuya = '20000000-0000-0000-0000-000000000001'
const teamLab = '20000000-0000-0000-0000-000000000002'
const fushimi = '20000000-0000-0000-0000-000000000003'
const nara = '20000000-0000-0000-0000-000000000004'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('T-11-01 planner creates a bucket and adds a dated visit', async ({
  page,
}) => {
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Schedule add')
  await createSpot(page, tripId, 'Shibuya Sky', 35.658, 139.702)
  await page.goto(`/trips/${tripId}/schedule`)
  await page.getByTestId('add-bucket').click()
  await page.getByLabel('Title').fill('Tokyo 12–16 Apr')
  await page.getByLabel('Start date').fill('2026-04-12')
  await page.getByLabel('End date').fill('2026-04-16')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const bucket = page
    .locator('[data-testid^="entry-row-"]')
    .filter({ hasText: 'Tokyo 12–16 Apr' })
  await bucket.getByRole('button', { name: 'Add spot' }).click()
  await page.getByRole('textbox', { name: 'Search spots' }).fill('Shibuya')
  await page.getByRole('option', { name: 'Shibuya Sky' }).click()
  await page.getByRole('button', { name: '2026-04-13' }).click()
  await page.getByLabel('Visit time').fill('18:00')
  await page.getByRole('button', { name: 'Add visit' }).click()

  await expect(bucket).toContainText('Shibuya Sky')
  await expect(bucket).toContainText('13 Apr 2026')
  await expect(bucket).toContainText('18:00')
})

test('T-11-02 adding a spot to a plan marks it planned', async ({ page }) => {
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Schedule panel')
  const spotId = await createSpot(page, tripId, 'Nara Park', 34.685, 135.843)
  await createBucket(page, tripId, 'Kyoto', '2026-04-17', '2026-04-20')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId(`card-${spotId}`).click()
  await page.getByRole('button', { name: 'Add to plan' }).click()
  await page.getByLabel('Plan entry').selectOption({ label: 'Kyoto' })
  await page.getByRole('button', { name: '2026-04-18' }).click()
  await page.getByLabel('Visit time').fill('09:00')
  await page.getByRole('button', { name: 'Add visit' }).click()
  await expect(page.getByText('Planned (1)')).toBeVisible()
  await expect(page.getByLabel('Category')).toHaveValue('maybe')
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId(`card-${spotId}`)).toContainText('18 Apr 2026')
})

test('T-11-03 drag and keyboard reorder persist', async ({ page }) => {
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Schedule order')
  const first = await createSpot(page, tripId, 'Alpha Spot', 35.65, 139.7)
  const second = await createSpot(page, tripId, 'Beta Spot', 35.66, 139.71)
  const entryId = await createBucket(
    page,
    tripId,
    'Tokyo',
    '2026-04-12',
    '2026-04-16',
  )
  const firstLink = await addVisit(page, entryId, first, '2026-04-13')
  const secondLink = await addVisit(page, entryId, second, '2026-04-14')
  await page.goto(`/trips/${tripId}/schedule`)
  await expect
    .poll(() => visitTitles(page))
    .toEqual(['Alpha Spot', 'Beta Spot'])

  const reordered = page.waitForResponse(
    (response) =>
      response.url().includes('/spots/order') &&
      response.request().method() === 'PUT' &&
      response.ok(),
  )
  await page
    .getByTestId(`drag-${secondLink}`)
    .dragTo(page.getByTestId(`drag-${firstLink}`))
  await reordered
  await expect
    .poll(() => visitTitles(page))
    .toEqual(['Beta Spot', 'Alpha Spot'])
  await page.reload()
  await expect
    .poll(() => visitTitles(page))
    .toEqual(['Beta Spot', 'Alpha Spot'])

  const restored = page.waitForResponse(
    (response) =>
      response.url().includes('/spots/order') &&
      response.request().method() === 'PUT' &&
      response.ok(),
  )
  await page.getByTestId(`move-down-${secondLink}`).focus()
  await page.keyboard.press('Enter')
  await restored
  await expect
    .poll(() => visitTitles(page))
    .toEqual(['Alpha Spot', 'Beta Spot'])
  await page.reload()
  await expect
    .poll(() => visitTitles(page))
    .toEqual(['Alpha Spot', 'Beta Spot'])
})

test('T-11-04 selecting a bucket fits the map to its spots', async ({
  page,
}) => {
  await login(page, '100000000000000001')
  await setLocale(page, 'en')
  await page.goto(`${japanTrip}/schedule`)
  await waitForMap(page)
  const before = await mapView(page)
  await page.getByTestId(`entry-${tokyoEntry}`).click()
  await expect
    .poll(async () => (await mapView(page)).zoom)
    .toBeGreaterThan(before.zoom)
  await expect
    .poll(async () => (await mapView(page)).lng)
    .toBeGreaterThan(139.4)
  await expect(page.getByTestId(`pin-${shibuya}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId(`pin-${teamLab}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('T-11-05 plan entry filter keeps only that entry’s spots', async ({
  page,
}) => {
  await login(page, '100000000000000001')
  await setLocale(page, 'en')
  await page.goto(japanTrip)
  await page.getByRole('button', { name: 'Filter' }).click()
  await page.getByLabel('Plan entry').selectOption({ label: 'Tokyo' })
  await expect(page).toHaveURL(new RegExp(`entry=${tokyoEntry}`))
  await expect(page.getByTestId(`card-${shibuya}`)).toBeVisible()
  await expect(page.getByTestId(`card-${teamLab}`)).toBeVisible()
  await expect(page.getByTestId(`card-${fushimi}`)).toHaveCount(0)
  await expect(page.getByTestId(`card-${nara}`)).toHaveCount(0)
})

test('T-11-06 shrinking a bucket warns before visit dates are cleared', async ({
  page,
}) => {
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Schedule shrink')
  const spotId = await createSpot(page, tripId, 'Late Spot', 35.65, 139.7)
  const entryId = await createBucket(
    page,
    tripId,
    'Tokyo',
    '2026-04-12',
    '2026-04-16',
  )
  await addVisit(page, entryId, spotId, '2026-04-15')
  await page.goto(`/trips/${tripId}/schedule`)
  await page.getByRole('button', { name: 'Edit Tokyo' }).click()
  await page.getByLabel('End date').fill('2026-04-14')
  await expect(page.getByText('1 visit date will be cleared')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('schedule-list')).not.toContainText(
    '15 Apr 2026',
  )
})

test('T-11-07 a visitor sees the schedule without edit controls', async ({
  page,
}) => {
  await login(page, '100000000000000003')
  await setLocale(page, 'en')
  await page.goto(`${japanTrip}/schedule`)
  await expect(page.getByTestId(`entry-${tokyoEntry}`)).toBeVisible()
  await expect(page.getByTestId('add-bucket')).toHaveCount(0)
  await expect(page.getByTestId('add-single')).toHaveCount(0)
  await expect(page.locator('[data-testid^="drag-"]')).toHaveCount(0)
  await expect(page.locator('[data-testid^="remove-visit-"]')).toHaveCount(0)
  await expect(page.locator('[data-testid^="move-up-"]')).toHaveCount(0)
  await expect(page.locator('[data-testid^="move-down-"]')).toHaveCount(0)
})

test('T-11-09 schedule passes axe and reorders from the keyboard', async ({
  page,
}) => {
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Schedule keys')
  const first = await createSpot(page, tripId, 'Alpha Spot', 35.65, 139.7)
  const second = await createSpot(page, tripId, 'Beta Spot', 35.66, 139.71)
  const entryId = await createBucket(
    page,
    tripId,
    'Tokyo',
    '2026-04-12',
    '2026-04-16',
  )
  const firstLink = await addVisit(page, entryId, first, '2026-04-13')
  await addVisit(page, entryId, second, '2026-04-14')
  await page.goto(`/trips/${tripId}/schedule`)
  await expect(page.getByText('Alpha Spot')).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious).toEqual([])

  const down = page.getByTestId(`move-down-${firstLink}`)
  await page.getByTestId('add-bucket').focus()
  for (let step = 0; step < 40; step += 1) {
    if (await down.evaluate((element) => element === document.activeElement)) {
      break
    }
    await page.keyboard.press('Tab')
  }
  await expect(down).toBeFocused()
  const reordered = page.waitForResponse(
    (response) =>
      response.url().includes('/spots/order') &&
      response.request().method() === 'PUT' &&
      response.ok(),
  )
  await page.keyboard.press('Enter')
  await reordered
  await expect
    .poll(() => visitTitles(page))
    .toEqual(['Beta Spot', 'Alpha Spot'])
})

function visitTitles(page: Page) {
  return page.locator('[data-testid^="visit-title-"]').allTextContents()
}

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

async function createTrip(page: Page, name: string) {
  return page.evaluate(async (tripName) => {
    const response = await fetch('/api/trips', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: tripName,
        timezone: 'Asia/Tokyo',
        region: {
          bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 },
        },
      }),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = (await response.json()) as { id: string }
    return body.id
  }, name)
}

async function createSpot(
  page: Page,
  tripId: string,
  title: string,
  lat = 35.65,
  lng = 139.7,
) {
  return page.evaluate(
    async ({ tripId: id, title: spotTitle, lat: spotLat, lng: spotLng }) => {
      const response = await fetch(`/api/trips/${id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: spotTitle,
          lat: spotLat,
          lng: spotLng,
          baseCategory: 'maybe',
          address: 'Tokyo',
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { id: string }
      return body.id
    },
    { tripId, title, lat, lng },
  )
}

async function createBucket(
  page: Page,
  tripId: string,
  title: string,
  startDate: string,
  endDate: string,
) {
  return page.evaluate(
    async ({
      tripId: id,
      title: entryTitle,
      startDate: start,
      endDate: end,
    }) => {
      const response = await fetch(`/api/trips/${id}/plan`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'bucket',
          title: entryTitle,
          startDate: start,
          endDate: end,
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { id: string }
      return body.id
    },
    { tripId, title, startDate, endDate },
  )
}

async function addVisit(
  page: Page,
  entryId: string,
  spotId: string,
  visitDate: string,
) {
  return page.evaluate(
    async ({ entryId: id, spotId: spot, visitDate: date }) => {
      const response = await fetch(`/api/plan/${id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spotId: spot, visitDate: date }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { id: string }
      return body.id
    },
    { entryId, spotId, visitDate },
  )
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

async function waitForMap(page: Page) {
  await page.waitForFunction(
    () => {
      const map = (
        window as unknown as {
          __tripboardMap?: { getCenter: () => { lng: number; lat: number } }
        }
      ).__tripboardMap
      if (!map) return false
      const center = map.getCenter()
      return Number.isFinite(center.lng) && Number.isFinite(center.lat)
    },
    undefined,
    { timeout: 20_000 },
  )
}
