import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'
const fushimi = '20000000-0000-0000-0000-000000000003'
const shibuya = '20000000-0000-0000-0000-000000000001'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('T-18-03 an invalid link stays in the open panel, and a failed save keeps the draft', async ({
  page,
}) => {
  await login(page, '100000000000000801')
  await setLocale(page, 'en')
  await mockGeocode(page)
  const tripId = await createTrip(page, 'Link draft')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId('add-new').click()
  await titleField(page).fill('Keep title')
  await page.getByLabel('Address').fill('fushimi')
  await page
    .getByRole('option', { name: 'Fushimi Inari Taisha, Kyoto' })
    .click()
  await page.getByLabel('Link').fill('javascript:x')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByTestId('link-error')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'New spot' })).toBeVisible()
  await expect(titleField(page)).toHaveValue('Keep title')
  await expect(page.getByRole('combobox', { name: 'Address' })).toHaveValue(
    'Fushimi Inari Taisha, Kyoto',
  )

  await page.route('**/api/trips/**/spots', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{}',
      })
    }
    return route.continue()
  })
  await page.getByLabel('Link').fill('https://hotel.example')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByTestId('form-error')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'New spot' })).toBeVisible()
  await expect(titleField(page)).toHaveValue('Keep title')
  await expect(page.getByLabel('Link')).toHaveValue('https://hotel.example')
})

test('T-18-04 the list ignores the map until List follows map is on', async ({
  page,
}) => {
  await login(page, '100000000000000001')
  await setLocale(page, 'en')
  await page.goto(japanTrip)
  await waitForMap(page)
  await jumpToTokyo(page)
  await expect(page.getByTestId(`card-${fushimi}`)).toBeVisible()
  await expect(page.getByTestId(`card-${shibuya}`)).toBeVisible()

  await page.goto('/account')
  await page.getByRole('checkbox', { name: 'List follows map' }).check()
  await page.goto(japanTrip)
  await waitForMap(page)
  await jumpToTokyo(page)
  await expect(page.getByTestId(`card-${fushimi}`)).toHaveCount(0)
  await expect(page.getByTestId(`card-${shibuya}`)).toBeVisible()
  await page.reload()
  await waitForMap(page)
  await expect(page.getByTestId(`card-${fushimi}`)).toHaveCount(0)
  await expect(page.getByTestId(`card-${shibuya}`)).toBeVisible()
})

test('T-18-07 move down keeps focus, highlights the row, and announces it', async ({
  page,
}) => {
  await login(page, '100000000000000802')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Reorder feedback')
  const titles = ['Alpha', 'Beta', 'Gamma', 'Delta']
  const ids: string[] = []
  for (const title of titles) {
    ids.push(await createSpot(page, tripId, title))
  }
  const entryId = await createBucket(page, tripId, 'Tokyo')
  const links: string[] = []
  for (const [index, spotId] of ids.entries()) {
    links.push(await addVisit(page, entryId, spotId, `2026-04-1${index + 2}`))
  }
  await page.goto(`/trips/${tripId}/schedule`)
  await expect.poll(() => visitTitles(page)).toEqual(titles)

  const first = links[0]
  if (!first) throw new Error('missing link')
  const down = page.getByTestId(`move-down-${first}`)
  await move(page, down)
  await expect
    .poll(() => visitTitles(page))
    .toEqual(['Beta', 'Alpha', 'Gamma', 'Delta'])
  await expect(down).toBeFocused()
  await expect(page.getByTestId(`visit-${first}`)).toHaveAttribute(
    'data-highlighted',
    'true',
  )
  await expect(page.getByTestId('reorder-live')).toHaveText(
    'Alpha moved to position 2 of 4',
  )

  await move(page, down)
  await expect
    .poll(() => visitTitles(page))
    .toEqual(['Beta', 'Gamma', 'Alpha', 'Delta'])
  await expect(down).toBeFocused()
  await expect(page.getByTestId('reorder-live')).toHaveText(
    'Alpha moved to position 3 of 4',
  )
})

test('T-18-08 a failed reorder restores the order and shows a toast', async ({
  page,
}) => {
  await login(page, '100000000000000803')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Reorder revert')
  const first = await createSpot(page, tripId, 'Alpha')
  const second = await createSpot(page, tripId, 'Beta')
  const entryId = await createBucket(page, tripId, 'Tokyo')
  const firstLink = await addVisit(page, entryId, first, '2026-04-12')
  await addVisit(page, entryId, second, '2026-04-13')
  await page.goto(`/trips/${tripId}/schedule`)
  await expect.poll(() => visitTitles(page)).toEqual(['Alpha', 'Beta'])
  await page.route('**/api/plan/**/spots/order', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{}',
    }),
  )
  await page.getByTestId(`move-down-${firstLink}`).click()
  await expect(page.getByTestId('toast')).toBeVisible()
  await expect.poll(() => visitTitles(page)).toEqual(['Alpha', 'Beta'])
})

test('T-18-09 language lives in settings and still persists', async ({
  page,
}) => {
  await login(page, '100000000000000804')
  await setLocale(page, 'en')
  await page.goto('/trips')
  await expect(
    page.getByRole('banner').getByRole('group', { name: 'Language' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Account & settings' }).click()
  await expect(
    page.getByRole('heading', { name: 'Account & settings' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/me') &&
      response.request().method() === 'PATCH' &&
      response.ok(),
  )
  await page.getByRole('button', { name: 'DE' }).click()
  await expect(page.getByTestId('trip-switcher')).toHaveText('Reise')
  await saved
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Konto & Einstellungen' }),
  ).toBeVisible()
  await expect(page.getByTestId('trip-switcher')).toHaveText('Reise')
})

test('T-18-10 the login page keeps a language switch', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('group', { name: 'Language' })).toBeVisible()
  await page.getByRole('button', { name: 'DE' }).click()
  await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible()
})

test('T-18-11 a planner can create a spot from the schedule and add it', async ({
  page,
}) => {
  await login(page, '100000000000000805')
  await setLocale(page, 'en')
  await mockGeocode(page)
  const tripId = await createTrip(page, 'Schedule create')
  await createBucket(page, tripId, 'Tokyo')
  await page.goto(`/trips/${tripId}/schedule`)
  await waitForMap(page)
  const bucket = page
    .locator('[data-testid^="entry-row-"]')
    .filter({ hasText: 'Tokyo' })
  await bucket.getByRole('button', { name: 'Add spot' }).click()
  await page.getByRole('textbox', { name: 'Search spots' }).fill('Onsen')
  await page.getByRole('option', { name: "Create new spot 'Onsen'" }).click()
  const dialog = page.getByRole('dialog', { name: 'New spot' })
  await expect(dialog).toBeVisible()
  await expect(titleField(page)).toHaveValue('Onsen')
  await page
    .locator('.maplibregl-canvas')
    .click({ position: { x: 120, y: 160 } })
  await expect(page.getByTestId('draft-pin')).toBeVisible()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Visit date' })).toBeVisible()
  await page.getByRole('button', { name: '2026-04-13' }).click()
  await page.getByRole('button', { name: 'Add visit' }).click()
  await expect(bucket).toContainText('Onsen')
  await page.goto(`/trips/${tripId}`)
  await expect(
    page.getByTestId('spot-list').getByRole('button', { name: /Onsen/ }),
  ).toBeVisible()
})

test('T-18-12 a visitor does not see create spot', async ({ page }) => {
  await login(page, '100000000000000003')
  await setLocale(page, 'en')
  await page.goto(`${japanTrip}/schedule`)
  await expect(page.getByTestId('create-spot')).toHaveCount(0)
  await expect(page.getByText(/Create new spot/)).toHaveCount(0)
})

test('T-18-13 board and schedule keep separate map views', async ({ page }) => {
  await login(page, '100000000000000001')
  await setLocale(page, 'en')
  await page.goto(japanTrip)
  await waitForMap(page)
  await jumpToTokyo(page)
  await expect
    .poll(async () => page.evaluate(() => location.hash))
    .toMatch(/^#\d/)
  await page.getByRole('link', { name: 'Schedule' }).click()
  await waitForMap(page)
  await expect.poll(async () => (await mapView(page)).zoom).toBeLessThan(8)
  await page.getByRole('link', { name: 'Board' }).click()
  await waitForMap(page)
  await expect.poll(async () => (await mapView(page)).zoom).toBeGreaterThan(9)
  await expect.poll(async () => (await mapView(page)).lng).toBeGreaterThan(139)
  await page.getByRole('link', { name: 'Schedule' }).click()
  await waitForMap(page)
  await expect
    .poll(async () => page.evaluate(() => location.hash))
    .toMatch(/^#s\//)
  const scheduleView = await mapView(page)
  await page.reload()
  await waitForMap(page)
  const reloaded = await mapView(page)
  expect(reloaded.zoom).toBeCloseTo(scheduleView.zoom, 1)
  expect(reloaded.lat).toBeCloseTo(scheduleView.lat, 2)
  expect(reloaded.lng).toBeCloseTo(scheduleView.lng, 2)
  expect(reloaded.zoom).toBeLessThan(8)
})

test('T-18-14 settings and the create flow pass axe and work from the keyboard', async ({
  page,
}) => {
  await login(page, '100000000000000806')
  await setLocale(page, 'en')
  await page.goto('/account')
  await expect(
    page.getByRole('heading', { name: 'Account & settings' }),
  ).toBeVisible()
  await expectNoSeriousViolations(page)
  await shot(page, 'settings-1280')
  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, 'settings-768')
  await expectNoSeriousViolations(page)

  await page.setViewportSize({ width: 1280, height: 800 })
  const tripId = await createTrip(page, 'Keyboard create')
  await createBucket(page, tripId, 'Tokyo')
  await page.goto(`/trips/${tripId}/schedule`)
  await expectNoSeriousViolations(page)
  await page.getByRole('button', { name: 'Add spot' }).click()
  const search = page.getByRole('textbox', { name: 'Search spots' })
  await search.focus()
  await page.keyboard.type('Onsen')
  const create = page.getByRole('option', { name: "Create new spot 'Onsen'" })
  for (let step = 0; step < 8; step += 1) {
    if (
      await create.evaluate((element) => element === document.activeElement)
    ) {
      break
    }
    await page.keyboard.press('Tab')
  }
  await expect(create).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'New spot' })
  await expect(dialog).toBeVisible()
  await expect(titleField(page)).toHaveValue('Onsen')
  const results = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze()
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious).toEqual([])
})

function titleField(page: Page) {
  return page.getByRole('textbox', { name: 'Title', exact: true })
}

async function move(page: Page, down: ReturnType<Page['getByTestId']>) {
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/spots/order') &&
      response.request().method() === 'PUT' &&
      response.ok(),
  )
  await down.click()
  await saved
}

async function jumpToTokyo(page: Page) {
  await page.evaluate(() => {
    const map = (
      window as unknown as {
        __tripboardMap?: { jumpTo: (options: object) => void }
      }
    ).__tripboardMap
    map?.jumpTo({ center: [139.75, 35.68], zoom: 11 })
  })
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
          bbox: { minLng: 139.4, minLat: 35.4, maxLng: 139.9, maxLat: 35.8 },
        },
      }),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = (await response.json()) as { id: string }
    return body.id
  }, name)
}

async function createSpot(page: Page, tripId: string, title: string) {
  return page.evaluate(
    async ({ tripId: id, title: spotTitle }) => {
      const response = await fetch(`/api/trips/${id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: spotTitle,
          lat: 35.68,
          lng: 139.76,
          baseCategory: 'maybe',
          address: 'Tokyo',
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { id: string }
      return body.id
    },
    { tripId, title },
  )
}

async function createBucket(page: Page, tripId: string, title: string) {
  return page.evaluate(
    async ({ tripId: id, title: entryTitle }) => {
      const response = await fetch(`/api/trips/${id}/plan`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'bucket',
          title: entryTitle,
          startDate: '2026-04-12',
          endDate: '2026-04-16',
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { id: string }
      return body.id
    },
    { tripId, title },
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

async function mockGeocode(page: Page) {
  await page.route('**/api/geocode/search**', (route) =>
    route.fulfill({
      json: {
        results: [
          {
            label: 'Fushimi Inari Taisha, Kyoto',
            lat: 34.9671,
            lng: 135.7727,
          },
        ],
      },
    }),
  )
  await page.route('**/api/geocode/reverse**', (route) =>
    route.fulfill({
      json: { label: 'Tokyo, Japan', lat: 35.68, lng: 139.7 },
    }),
  )
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious).toEqual([])
}

async function shot(page: Page, name: string) {
  const image = await page.screenshot()
  await test.info().attach(name, { body: image, contentType: 'image/png' })
}
