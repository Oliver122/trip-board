import { expectNoSeriousViolations } from './a11y'
import { answerConfirm } from './confirm'
import { expect, test, type Page } from './fixtures'
import { waitForMap } from './map'

const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'
const fushimi = '20000000-0000-0000-0000-000000000003'
const shibuya = '20000000-0000-0000-0000-000000000001'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockGeocode(page)
})

test('T-07-01 planner adds a spot from address search', async ({ page }) => {
  await login(page, '100000000000000002')
  const tripId = await createTrip(page, 'Panel add')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId('add-new').click()
  await titleField(page).fill('Fushimi Inari')
  await page.getByLabel('Address').fill('fushimi')
  await page
    .getByRole('option', { name: 'Fushimi Inari Taisha, Kyoto' })
    .click()
  await page.getByRole('button', { name: 'Must go', exact: true }).click()
  await page.getByLabel('Info').fill('Go early')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-testid^="card-temp-"]')).toHaveCount(0)
  await expect(
    page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Fushimi Inari/ }),
  ).toBeVisible()
  await expect(
    page.locator('[data-testid^="pin-"]:not([data-testid="draft-pin"])'),
  ).toBeVisible()
})

test('T-07-02 a map click places a pin and fills the address', async ({
  page,
}) => {
  await login(page, '100000000000000002')
  const tripId = await createTrip(page, 'Panel place')
  await page.goto(`/trips/${tripId}`)
  await waitForMap(page)
  await page.getByTestId('add-new').click()
  await page
    .locator('.maplibregl-canvas')
    .click({ position: { x: 80, y: 180 } })
  await expect(page.getByTestId('draft-pin')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Address' })).toHaveValue(
    'Kyoto, Japan',
  )
})

test('T-07-03 edit saves the title and delete removes the spot', async ({
  page,
}) => {
  await login(page, '100000000000000002')
  const tripId = await createTrip(page, 'Panel edit')
  await createSpot(page, tripId, 'Old title')
  await page.goto(`/trips/${tripId}`)
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Old title/ })
    .click()
  await titleField(page).fill('New title')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(
    page.getByTestId('spot-list').getByRole('button', { name: /New title/ }),
  ).toBeVisible()

  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /New title/ })
    .click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete spot' }).click()
  await expect(page.getByText('New title')).toHaveCount(0)
  await expect(page.getByTestId('draft-pin')).toHaveCount(0)
})

test('T-07-04 viewport filtering hides spots outside the map', async ({
  page,
}) => {
  await login(page, '100000000000000001')
  await setLocale(page, 'en')
  await page.goto(japanTrip)
  await waitForMap(page)
  await expect(page.getByTestId(`card-${fushimi}`)).toBeVisible()
  await page.getByRole('checkbox', { name: 'Only visible on map' }).check()
  await page.evaluate(() => {
    const map = (
      window as unknown as {
        __tripboardMap?: { jumpTo: (options: object) => void }
      }
    ).__tripboardMap
    map?.jumpTo({ center: [139.75, 35.68], zoom: 11 })
  })
  await expect(page.getByTestId(`card-${fushimi}`)).toHaveCount(0)
  await expect(page.getByTestId(`card-${shibuya}`)).toBeVisible()
  await page.getByRole('checkbox', { name: 'Only visible on map' }).uncheck()
  await expect(page.getByTestId(`card-${fushimi}`)).toBeVisible()
})

test('T-07-05 hover highlights the pin and a pin opens its card', async ({
  page,
}) => {
  await login(page, '100000000000000001')
  await setLocale(page, 'en')
  await page.goto(japanTrip)
  await waitForMap(page)
  await page.getByTestId(`card-${fushimi}`).hover()
  await expect(page.getByTestId(`pin-${fushimi}`)).toHaveClass(/is-hover/)
  await page.getByTestId(`pin-${fushimi}`).click()
  await expect(page.getByRole('dialog', { name: 'Edit spot' })).toBeVisible()
  await expect(page.getByText('Planned (1)')).toBeVisible()
  await expect(page.getByTestId(`card-${fushimi}`)).toBeInViewport()
})

test('T-07-06 a visitor gets a read-only panel', async ({ page }) => {
  await login(page, '100000000000000003')
  await setLocale(page, 'en')
  await page.goto(japanTrip)
  await expect(page.getByTestId('add-new')).toHaveCount(0)
  await page.getByTestId(`card-${fushimi}`).click()
  await expect(titleField(page)).toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Delete', exact: true }),
  ).toHaveCount(0)
})

test('T-07-07 a failed save reverts the card and shows a toast', async ({
  page,
}) => {
  await login(page, '100000000000000002')
  const tripId = await createTrip(page, 'Panel revert')
  await createSpot(page, tripId, 'Keep me')
  await page.goto(`/trips/${tripId}`)
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Keep me/ })
    .click()
  await titleField(page).fill('Broken title')
  await page.route('**/api/spots/**', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{}',
      })
    }
    return route.continue()
  })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('toast')).toBeVisible()
  await expect(
    page.getByTestId('spot-list').getByRole('button', { name: /Keep me/ }),
  ).toBeVisible()
  await expect(page.getByText('Broken title')).toHaveCount(0)
})

test('T-07-08 unsaved changes ask before closing', async ({ page }) => {
  await login(page, '100000000000000002')
  const tripId = await createTrip(page, 'Panel discard')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId('add-new').click()
  await titleField(page).fill('Draft')
  await page.keyboard.press('Escape')
  await answerConfirm(page, 'dismiss')
  await expect(page.getByRole('dialog', { name: 'New spot' })).toBeVisible()
  await page.keyboard.press('Escape')
  await answerConfirm(page, 'accept')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('T-07-11 the panel is a dialog, traps focus, and restores it', async ({
  page,
}) => {
  await login(page, '100000000000000002')
  const tripId = await createTrip(page, 'Panel a11y')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId('add-new').click()
  const dialog = page.getByRole('dialog', { name: 'New spot' })
  await expect(dialog).toBeVisible()
  await expectNoSeriousViolations(page, { include: '[role="dialog"]' })

  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('Tab')
  }
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          document
            .querySelector('[role="dialog"]')
            ?.contains(document.activeElement),
        ),
      ),
    )
    .toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('add-new')).toBeFocused()
})

function titleField(page: Page) {
  return page.getByRole('textbox', { name: 'Title', exact: true })
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

async function createSpot(page: Page, tripId: string, title: string) {
  await page.evaluate(
    async ({ tripId: id, title: spotTitle }) => {
      const response = await fetch(`/api/trips/${id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: spotTitle,
          lat: 35.01,
          lng: 135.76,
          baseCategory: 'maybe',
          address: 'Kyoto',
        }),
      })
      if (!response.ok) throw new Error(await response.text())
    },
    { tripId, title },
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
      json: { label: 'Kyoto, Japan', lat: 35, lng: 135.75 },
    }),
  )
}
