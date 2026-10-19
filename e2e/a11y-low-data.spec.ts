import { expect, test } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y'
import {
  deleteCreatedTrips,
  freshUser,
  login,
  tripWithPhotos,
} from './low-data'

test.afterEach(async ({ page }) => {
  await deleteCreatedTrips(page)
})

// T-38-14, low-data parts: badge, photo placeholders and the Load map confirm.
for (const theme of ['Dark', 'Light'] as const) {
  test(`T-38-14 axe finds no serious issues with low data on at 390 px (${theme})`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({
      colorScheme: theme === 'Dark' ? 'dark' : 'light',
    })
    await login(page, freshUser())
    const { tripId } = await tripWithPhotos(page, `A11y low data ${theme}`)
    await page.addInitScript(() => localStorage.setItem('dataSaver', 'on'))
    await page.goto(`/trips/${tripId}?view=list`)
    await expect(page.getByTestId('data-saver-badge')).toBeVisible()
    await expectNoSeriousViolations(page, { label: `${theme} list + badge` })

    await page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Kinkaku-ji/ })
      .click()
    await page.getByRole('button', { name: /^Photos/ }).click()
    await expect(page.getByTestId('photo-placeholder').first()).toBeVisible()
    await expectNoSeriousViolations(page, {
      label: `${theme} photo placeholders`,
    })

    await page.goto(`/trips/${tripId}`)
    await page
      .getByRole('navigation', { name: 'Trip sections' })
      .getByRole('link', { name: 'Map' })
      .click()
    await expect(
      page.getByText('Load the map? Uses about 2–5 MB.'),
    ).toBeVisible()
    await expectNoSeriousViolations(page, { label: `${theme} Load map` })
  })
}
