import { expect, test } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y'
import {
  deleteCreatedTrips,
  freshUser,
  login,
  tripWithPhotos,
} from './low-data'

test.use({ viewport: { width: 390, height: 844 } })

test.afterEach(async ({ page }) => {
  await deleteCreatedTrips(page)
})

// T-38-14, phone layout parts: board Map and List, the More sheet and the
// panel with a section open. The low-data parts live in a11y-low-data.spec.ts.
for (const theme of ['Dark', 'Light'] as const) {
  test(`T-38-14 axe finds no serious issues on the phone layout (${theme})`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await login(page, freshUser())
    const { tripId } = await tripWithPhotos(page, `A11y phone ${theme}`)
    await page.goto(`/trips/${tripId}`)
    await page.getByRole('button', { name: 'More' }).click()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await sheet.getByRole('button', { name: /^Theme/ }).click()
    await sheet.getByRole('radio', { name: theme }).check()
    await expectNoSeriousViolations(page, { label: `${theme} More sheet` })
    await page
      .getByRole('dialog', { name: 'More' })
      .getByRole('button', { name: 'Close' })
      .click()
    await expectNoSeriousViolations(page, { label: `${theme} Map` })

    await page.goto(`/trips/${tripId}?view=list`)
    await page.getByRole('switch', { name: 'Only visible on map' }).uncheck()
    await expectNoSeriousViolations(page, { label: `${theme} List` })

    await page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Kinkaku-ji/ })
      .click()
    await expectNoSeriousViolations(page, { label: `${theme} panel` })
    await page.getByRole('button', { name: /^Comments/ }).click()
    await expect(
      page.getByRole('button', { name: /^Comments/ }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expectNoSeriousViolations(page, { label: `${theme} panel section` })
  })
}
