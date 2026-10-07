import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y'

test.use({ locale: 'en-GB' })

test('T-04-08 empty state, create Japan 2026, and show it in My trips', async ({
  page,
}) => {
  await login(page, freshDiscordId())
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/trips')
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()
  await expect(page.getByText('No trips yet.')).toBeVisible()
  await expect(
    page.getByText("Create your first trip, like 'Japan 2026'"),
  ).toBeVisible()
  await shot(page, 'trips-empty-1280')
  await expectNoSeriousViolations(page)

  await page.getByRole('button', { name: 'Create your first trip' }).click()
  const dialog = page.getByRole('dialog', { name: 'New trip' })
  await dialog.getByLabel('Name').fill('Japan 2026')
  await dialog.getByRole('combobox', { name: 'Region' }).fill('Japan')
  await dialog.getByRole('option', { name: 'Japan' }).click()
  await expect(dialog.getByLabel('Timezone')).toHaveValue('Asia/Tokyo')
  await dialog.getByRole('button', { name: 'Create trip' }).click()

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/)
  await page.goto('/trips')
  await expect(page.getByRole('link', { name: /Japan 2026/ })).toBeVisible()
  await shot(page, 'trips-card-1280')
  await expectNoSeriousViolations(page)

  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, 'trips-card-768')
  await expectNoSeriousViolations(page)
})

test('T-04-09 delete stays disabled until the trip name is typed', async ({
  page,
}) => {
  await login(page, freshDiscordId())
  const tripId = await createJapan(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/trips/${tripId}/settings`)
  await expect(page.getByRole('heading', { name: 'Japan 2026' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete trip' }).click()

  const dialog = page.getByRole('dialog', { name: 'Delete trip' })
  const confirm = dialog.getByRole('button', { name: 'Delete trip' })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel('Confirm trip name').fill('Japan')
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel('Confirm trip name').fill('Japan 2026')
  await expect(confirm).toBeEnabled()
  await shot(page, 'delete-trip-1280')
  await expectNoSeriousViolations(page)

  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, 'delete-trip-768')
  await confirm.click()
  await expect(page).toHaveURL(/\/trips$/)
  await expect(page.getByText('No trips yet.')).toBeVisible()
})

function freshDiscordId() {
  return `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`.slice(0, 18)
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

async function createJapan(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/trips', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Japan 2026',
        timezone: 'Asia/Tokyo',
        region: {
          bbox: { minLng: 122.94, minLat: 24.4, maxLng: 145.82, maxLat: 45.55 },
        },
      }),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = (await response.json()) as { id: string }
    return body.id
  })
}

async function shot(page: Page, name: string) {
  const image = await page.screenshot()
  await test.info().attach(name, { body: image, contentType: 'image/png' })
}
