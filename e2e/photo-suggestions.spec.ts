import { expect, test, type Page } from '@playwright/test'

const planner = '100000000000000002'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('T-34-08 suggestions load on demand, add to the gallery and credit the author', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/photo-suggestions')) {
      requests.push(request.url())
    }
  })
  await login(page, planner)
  const tripId = await createTrip(page, 'Suggested photos')
  await createSpot(page, tripId, 'Kinkaku-ji', 35.0394, 135.7292)
  await createSpot(page, tripId, 'Empty field', 34.5, 136.5)
  await page.goto(`/trips/${tripId}`)
  await openSpot(page, /Kinkaku-ji/)
  const dialog = page.getByRole('dialog', { name: 'Edit spot' })
  const toggle = dialog.getByRole('button', { name: 'Suggested photos' })
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await page.waitForTimeout(500)
  expect(requests).toEqual([])

  await toggle.click()
  const strip = dialog.getByTestId('photo-suggestions')
  const items = strip.getByRole('listitem')
  await expect(items.first()).toContainText(' · ')
  const total = await items.count()
  expect(total).toBeGreaterThanOrEqual(2)
  expect(requests).toHaveLength(1)
  const credit = (await items.first().locator('p').innerText()).trim()
  const [artist, license] = credit.split(' · ')
  await expect(
    strip.getByRole('link', { name: 'From Wikimedia Commons' }),
  ).toBeVisible()

  await items
    .first()
    .getByRole('button', { name: /^Add image by/ })
    .click()
  await expect(
    page.getByRole('button', { name: 'Photo', exact: true }),
  ).toHaveCount(1)
  await expect(items).toHaveCount(total - 1)

  await page.getByRole('button', { name: 'Photo', exact: true }).click()
  const link = page.getByTestId('lightbox').getByRole('link', {
    name: `Photo: ${artist} · ${license} · Wikimedia Commons`,
  })
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(link).toHaveAttribute('target', '_blank')
  await page.keyboard.press('Escape')

  await page.goto(`/trips/${tripId}`)
  await openSpot(page, /Empty field/)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Suggested photos' })
    .click()
  await expect(
    page.getByText('No free photos found near this place'),
  ).toBeVisible()
})

test('T-34-08 a failing Commons shows a retry line that recovers', async ({
  page,
}) => {
  await login(page, planner)
  const tripId = await createTrip(page, 'Suggestions retry')
  await createSpot(page, tripId, 'Kinkaku-ji', 35.0394, 135.7292)
  await page.route('**/api/trips/*/photo-suggestions*', (route) =>
    route.fulfill({ status: 502, json: { error: 'commons_failed' } }),
  )
  await page.goto(`/trips/${tripId}`)
  await openSpot(page, /Kinkaku-ji/)
  const dialog = page.getByRole('dialog', { name: 'Edit spot' })
  await dialog.getByRole('button', { name: 'Suggested photos' }).click()
  await expect(
    dialog.getByText('Could not load the suggestions.'),
  ).toBeVisible()
  await page.unroute('**/api/trips/*/photo-suggestions*')
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await expect(
    dialog.getByTestId('photo-suggestions').getByRole('listitem').first(),
  ).toBeVisible()
})

async function openSpot(page: Page, name: RegExp) {
  await page.getByTestId('spot-list').getByRole('button', { name }).click()
  await expect(page.getByRole('dialog', { name: 'Edit spot' })).toBeVisible()
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
  lat: number,
  lng: number,
) {
  await page.evaluate(
    async (spot) => {
      const response = await fetch(`/api/trips/${spot.tripId}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: spot.title,
          lat: spot.lat,
          lng: spot.lng,
          baseCategory: 'maybe',
        }),
      })
      if (!response.ok) throw new Error(await response.text())
    },
    { tripId, title, lat, lng },
  )
}
