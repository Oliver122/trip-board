import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
).toString('base64')

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('T-08-11 planner drops two images, sees progress, and opens the lightbox', async ({
  page,
}, testInfo) => {
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Photo drop')
  await createSpot(page, tripId, 'Temple')
  await page.goto(`/trips/${tripId}`)
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Temple/ })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Edit spot' })
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('quota-counter')).toBeVisible()
  const before = await page.getByTestId('quota-counter').innerText()

  const progress = page.getByRole('progressbar', { name: 'Uploading' })
  const seen = progress.waitFor({ state: 'visible' })
  await dropImages(page)
  await seen
  await expect(page.getByRole('button', { name: 'Photo' })).toHaveCount(2)
  await expect(page.getByTestId('quota-counter')).not.toHaveText(before)

  await page.getByRole('button', { name: 'Photo' }).first().click()
  await expect(page.getByTestId('lightbox')).toBeVisible()
  await expect(
    page.getByTestId('lightbox').getByRole('img', { name: 'Photo' }),
  ).toBeVisible()

  await expectNoSeriousViolations(page, { include: '[role="dialog"]' })
  await testInfo.attach('gallery-1280', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })

  await page.goto('/account')
  await expect(page.getByRole('progressbar', { name: 'Storage' })).toBeVisible()
  await expect(page.getByTestId('account-quota')).toContainText('MB of')
  await testInfo.attach('account-1280', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  await page.setViewportSize({ width: 768, height: 1024 })
  await testInfo.attach('account-768', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })

  await page.evaluate(async (id) => {
    await fetch(`/api/trips/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
  }, tripId)
})

test('T-08-12 a full quota disables the drop zone', async ({ page }) => {
  await page.route('**/api/me/quota', (route) =>
    route.fulfill({
      json: {
        usedImages: 100,
        maxImages: 100,
        usedBytes: 0,
        maxBytes: 209715200,
      },
    }),
  )
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Quota full')
  await createSpot(page, tripId, 'Temple')
  await page.goto(`/trips/${tripId}`)
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Temple/ })
    .click()
  const drop = page.getByTestId('image-drop')
  await expect(drop).toHaveText('Image limit reached')
  await expect(drop).toHaveAttribute('aria-disabled', 'true')
  await expect(drop.locator('input')).toHaveCount(0)
})

async function dropImages(page: Page) {
  await page.evaluate((file) => {
    const zone = document.querySelector('[data-testid="image-drop"]')
    if (!(zone instanceof HTMLElement)) throw new Error('missing drop zone')
    const transfer = new DataTransfer()
    for (const name of ['one.png', 'two.png']) {
      const bytes = Uint8Array.from(atob(file), (char) => char.charCodeAt(0))
      transfer.items.add(new File([bytes], name, { type: 'image/png' }))
    }
    zone.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    )
  }, png)
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
