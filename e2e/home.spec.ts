import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'
const tokyoEntry = '30000000-0000-0000-0000-000000000001'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('T-12-05 switching to Home reveals stay fields and switching away clears them', async ({
  page,
}) => {
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Home stay')
  const spotId = await createSpot(page, tripId, 'Hotel Gracery')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId(`card-${spotId}`).click()
  await page.getByLabel('Category').selectOption({ label: 'Home' })
  await expect(page.getByLabel('Stay from')).toBeVisible()
  await expect(page.getByLabel('Stay to')).toBeVisible()
  await expect(page.getByLabel('Primary home base')).toBeVisible()
  await page.getByLabel('Stay from').fill('2026-04-12')
  await page.getByLabel('Stay to').fill('2026-04-16')
  await page.getByLabel('Primary home base').check()

  const results = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze()
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious).toEqual([])
  await shot(page, 'home-panel-1280')
  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, 'home-panel-768')
  await page.setViewportSize({ width: 1280, height: 800 })

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('Stay dates')
    void dialog.accept()
  })
  await page.getByLabel('Category').selectOption({ label: 'Maybe' })
  await expect(page.getByLabel('Stay from')).toHaveCount(0)
  await expect(page.getByLabel('Primary home base')).toHaveCount(0)

  await page.getByLabel('Category').selectOption({ label: 'Home' })
  await expect(page.getByLabel('Stay from')).toHaveValue('')
  await expect(page.getByLabel('Stay to')).toHaveValue('')
  await expect(page.getByLabel('Primary home base')).not.toBeChecked()
})

test('T-12-06 schedule shows the home in the Tokyo bucket header', async ({
  page,
}) => {
  await login(page, '100000000000000001')
  await setLocale(page, 'en')
  await page.goto(`${japanTrip}/schedule`)
  await expect(page.getByTestId(`entry-row-${tokyoEntry}`)).toContainText(
    '⌂ Hotel Gracery',
  )
  await shot(page, 'schedule-home-1280')
  await page.setViewportSize({ width: 768, height: 1024 })
  await expect(page.getByTestId(`entry-row-${tokyoEntry}`)).toContainText(
    '⌂ Hotel Gracery',
  )
  await shot(page, 'schedule-home-768')
})

test('T-12-07 overlapping stays warn in both panels', async ({ page }) => {
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Home overlap')
  const hotelId = await createHome(page, tripId, {
    title: 'Hotel Gracery',
    stayFrom: '2026-04-12',
    stayTo: '2026-04-16',
  })
  const ryokanId = await createHome(page, tripId, {
    title: 'Kyoto Ryokan',
    stayFrom: '2026-04-16',
    stayTo: '2026-04-20',
    lat: 35.01,
    lng: 135.77,
  })
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId(`card-${hotelId}`).click()
  await expect(page.getByTestId('stay-overlap')).toContainText('Kyoto Ryokan')
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByTestId(`card-${ryokanId}`).click()
  await expect(page.getByTestId('stay-overlap')).toContainText('Hotel Gracery')
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
  return page.evaluate(
    async ({ tripId: id, title: spotTitle }) => {
      const response = await fetch(`/api/trips/${id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: spotTitle,
          lat: 35.69,
          lng: 139.7,
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

async function createHome(
  page: Page,
  tripId: string,
  spot: {
    title: string
    stayFrom: string
    stayTo: string
    lat?: number
    lng?: number
  },
) {
  return page.evaluate(
    async ({ tripId: id, spot: input }) => {
      const response = await fetch(`/api/trips/${id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: input.title,
          lat: input.lat ?? 35.69,
          lng: input.lng ?? 139.7,
          baseCategory: 'home',
          stayFrom: input.stayFrom,
          stayTo: input.stayTo,
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { id: string }
      return body.id
    },
    { tripId, spot },
  )
}

async function shot(page: Page, name: string) {
  const image = await page.screenshot()
  await test.info().attach(name, { body: image, contentType: 'image/png' })
}
