import { expectNoSeriousViolations } from './a11y'
import { expect, test, type Page } from './fixtures'

for (const scheme of ['light', 'dark'] as const) {
  test(`T-33-10 axe finds no serious issues on the add panel with a Google Maps link error in ${scheme} mode`, async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.emulateMedia({ colorScheme: scheme })
    await page.route('**/api/trips/*/places/from-link', (route) =>
      route.fulfill({
        status: 400,
        json: { error: 'link_not_google_maps' },
      }),
    )
    await login(page, '100000000000000002')
    const tripId = await createTrip(page, `Places a11y ${scheme}`)
    await page.goto(`/trips/${tripId}`)
    await page.getByTestId('add-new').click()
    const dialog = page.getByRole('dialog', { name: 'New spot' })
    await expectNoSeriousViolations(page, `add panel ${scheme}`)

    await dialog.getByLabel('Google Maps link').fill('https://example.com')
    await dialog.getByRole('button', { name: 'Fill in' }).click()
    await expect(page.getByTestId('maps-link-error')).toHaveText(
      'This is not a Google Maps link.',
    )
    await expect(dialog.getByLabel('Google Maps link')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await expectNoSeriousViolations(page, `add panel with error ${scheme}`)
  })
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
    await fetch('/api/me', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'en' }),
    })
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
