import { expect, test, type Browser, type Page } from '@playwright/test'
import { freshUser, login } from './low-data'
import { showLocale } from './locale'

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
    return ((await response.json()) as { id: string }).id
  }, name)
}

/** An owner's trip with one planner who joined by invite. */
async function tripWithMember(page: Page, browser: Browser) {
  await login(page, freshUser())
  const tripId = await createTrip(page, `Members dialog ${Date.now()}`)
  const code = await page.evaluate(async (id) => {
    const response = await fetch(`/api/trips/${id}/invites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'planner' }),
    })
    if (!response.ok) throw new Error(await response.text())
    return ((await response.json()) as { code: string }).code
  }, tripId)
  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  await login(guestPage, freshUser())
  await guestPage.evaluate(async (joinCode) => {
    const response = await fetch(`/api/join/${joinCode}`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) throw new Error(await response.text())
  }, code)
  await guest.close()
  return tripId
}

test('T-42-16 the members dialog has one title row, an owner block and a neutral remove menu', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const tripId = await tripWithMember(page, browser)
  await page.goto(`/trips/${tripId}`)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Members' }).click()
  const dialog = page.getByRole('dialog', { name: 'Members' })
  await expect(dialog).toBeVisible()

  // One title row with ×; no extra Close text button.
  await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(1)
  await expect(dialog.getByText('Close', { exact: true })).toHaveCount(0)

  // Owner block.
  await expect(dialog.getByRole('heading', { name: 'Owner' })).toBeVisible()
  await expect(dialog.getByLabel('New owner')).toBeVisible()
  await expect(
    dialog.getByText(
      "The owner can't leave the trip. Transfer ownership first.",
    ),
  ).toBeVisible()

  // Remove goes through a 44 px ⋯ menu, neutral, then a danger confirm.
  const actions = dialog.getByRole('button', { name: /^Actions for / })
  const box = await actions.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  expect(box?.height).toBeGreaterThanOrEqual(44)
  await actions.click()
  const item = page.getByRole('menuitem', { name: 'Remove from trip' })
  await expect(item).toBeVisible()
  const color = await item.evaluate((el) => getComputedStyle(el).color)
  const foreground = await dialog.evaluate((el) => getComputedStyle(el).color)
  expect(color).toBe(foreground)
  await item.click()
  const confirm = dialog.getByRole('button', { name: 'Remove', exact: true })
  await expect(confirm).toBeVisible()
  await confirm.click()
  await expect(
    dialog.getByRole('button', { name: /^Actions for / }),
  ).toHaveCount(0)

  // × closes, and so does Escape.
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Members' }).click()
  await expect(page.getByRole('dialog', { name: 'Members' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Members' })).toHaveCount(0)
})

test('T-42-16 the owner block and the remove menu are translated', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  const tripId = await tripWithMember(page, browser)
  await showLocale(page, 'de')
  await page.goto(`/trips/${tripId}`)
  await page.getByRole('button', { name: /^Mitglieder/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Mitglieder' })
  await expect(dialog.getByRole('heading', { name: 'Besitzer' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(dialog.getByLabel('Neuer Besitzer')).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: /^Aktionen für / }),
  ).toBeVisible()
})
