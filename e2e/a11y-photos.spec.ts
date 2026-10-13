import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y'

const planner = '100000000000000002'

test('T-34-11 axe finds no serious issues on the spot panel with the suggestion strip open in both themes', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, planner)
  const tripId = await createTrip(page, 'Photos a11y')
  await createSpot(page, tripId, 'Kinkaku-ji', 35.0394, 135.7292)

  for (const theme of ['Dark', 'Light'] as const) {
    await page.goto(`/trips/${tripId}`)
    await page.getByRole('button', { name: theme }).click()
    await page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Kinkaku-ji/ })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Edit spot' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Suggested photos' }).click()
    const items = dialog.getByTestId('photo-suggestions').getByRole('listitem')
    await expect(items.first()).toBeVisible()
    await expect(
      items.first().getByRole('button', { name: /^Add image by/ }),
    ).toBeVisible()
    await expectNoSeriousViolations(page, {
      include: '[role="dialog"]',
      label: `${theme} spot panel with suggestions`,
    })
  }
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
