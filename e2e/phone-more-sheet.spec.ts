import { expect, test } from '@playwright/test'
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

test('T-42-17 the More sheet has setting rows and keeps the bottom bar', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await login(page, freshUser())
  const { tripId } = await tripWithPhotos(page, 'More rows', 0)
  await page.goto(`/trips/${tripId}`)
  const bar = page.getByRole('navigation', { name: 'Trip sections' })
  await bar.getByRole('button', { name: 'More' }).click()
  const sheet = page.getByRole('dialog', { name: 'More' })
  await expect(sheet).toBeVisible()

  // Rows start at the 16 px edge and show their value.
  const rows = [
    sheet.getByRole('link', { name: /^Settings/ }),
    sheet.getByRole('button', { name: /^Theme/ }),
    sheet.getByRole('button', { name: /^Low data/ }),
  ]
  for (const row of rows) {
    const box = await row.boundingBox()
    expect(box?.x).toBe(0)
    const text = await row.locator('span').first().boundingBox()
    expect(text?.x).toBeGreaterThanOrEqual(16)
  }
  await expect(sheet.getByRole('button', { name: /^Theme/ })).toContainText(
    'System',
  )
  await expect(sheet.getByRole('button', { name: /^Low data/ })).toContainText(
    'Auto',
  )

  // The bar is visible under the sheet.
  const sheetBox = await sheet.boundingBox()
  const barBox = await bar.boundingBox()
  expect((sheetBox?.y ?? 0) + (sheetBox?.height ?? 0)).toBeLessThanOrEqual(
    (barBox?.y ?? 0) + 1,
  )

  // Theme opens three options and switches to dark.
  await sheet.getByRole('button', { name: /^Theme/ }).click()
  await expect(sheet.getByRole('radio')).toHaveCount(3)
  await sheet.getByRole('radio', { name: 'Dark' }).check()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await sheet.getByRole('radio', { name: 'System' }).check()

  // Low data opens Auto / On / Off with the explanation and switches on.
  await sheet.getByRole('button', { name: /^Low data/ }).click()
  await expect(sheet.getByText(/Low data loads no photos/)).toBeVisible()
  await sheet.getByRole('radio', { name: 'On' }).check()
  await expect(sheet.getByRole('button', { name: /^Low data/ })).toContainText(
    'On',
  )
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('data-saver-badge')).toBeVisible()

  // The bar stays usable while the sheet is open.
  await bar.getByRole('button', { name: 'More' }).click()
  await bar.getByRole('link', { name: 'List' }).click()
  await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0)
  await expect(bar.getByRole('link', { name: 'List' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('T-42-17 the account page shows theme and language as rows', async ({
  page,
}) => {
  await login(page, freshUser())
  await page.goto('/account')
  const theme = page.getByTestId('storage-meter')
  await expect(theme).toHaveCount(1)
  const language = page.getByRole('group', { name: 'Language' })
  const themeGroup = page.getByRole('group', { name: 'Theme' })
  await expect(language).toBeVisible()
  await expect(themeGroup).toBeVisible()
  const heading = await page
    .getByRole('heading', { name: 'Account & settings' })
    .boundingBox()
  const label = await page.getByText('Language', { exact: true }).boundingBox()
  expect(label?.x).toBe(heading?.x)
  await expect(page.getByTestId('list-follows-map')).toHaveAttribute(
    'role',
    'switch',
  )
})
