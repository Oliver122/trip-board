import { expect, test, type Page } from '@playwright/test'

const planner = '100000000000000002'
const tomId = '100000000000000003'
const japanTrip = '10000000-0000-0000-0000-000000000001'
const fixture = 'http://fixtures.tripboard.test/photo.jpg'

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('T-34-05 a planner drops a link and pastes a picture into the gallery', async ({
  page,
}) => {
  await login(page, planner)
  const tripId = await createTrip(page, 'Web photos')
  await createSpot(page, tripId, 'Kinkaku-ji', 35.0394, 135.7292)
  await page.route('**/api/spots/*/images/from-url', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400))
    await route.continue()
  })
  await page.goto(`/trips/${tripId}`)
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Kinkaku-ji/ })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Edit spot' })
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('quota-counter')).toBeVisible()
  const before = await page.getByTestId('quota-counter').innerText()

  const google = dialog.getByRole('link', { name: 'Find images on Google' })
  await expect(google).toHaveAttribute(
    'href',
    'https://www.google.com/search?tbm=isch&q=Kinkaku-ji',
  )
  await expect(google).toHaveAttribute('target', '_blank')
  await expect(google).toHaveAttribute('rel', 'noopener noreferrer')

  const progress = page.getByRole('progressbar', { name: 'Uploading' })
  const seen = progress.waitFor({ state: 'visible' })
  await drop(page, { 'text/uri-list': `# from a tab\r\n${fixture}` })
  await seen
  const photos = page.getByRole('button', { name: 'Photo', exact: true })
  await expect(photos).toHaveCount(1, { timeout: 20_000 })
  await expect(page.getByTestId('quota-counter')).not.toHaveText(before)

  await photos.first().click()
  const lightbox = page.getByTestId('lightbox')
  await expect(
    lightbox.getByRole('link', { name: 'Source: fixtures.tripboard.test' }),
  ).toHaveAttribute('href', fixture)
  await expect(lightbox.getByRole('link', { name: /Source:/ })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  )
  await lightbox.getByRole('button', { name: 'Close' }).click()
  await expect(lightbox).toHaveCount(0)

  await page.getByTestId('image-drop').focus()
  await pastePng(page)
  await expect(photos).toHaveCount(2)

  await drop(page, { 'text/plain': 'hello' })
  await expect(
    dialog.getByText('This is not an image or image link'),
  ).toBeVisible()
})

test('T-34-10 a visitor sees no web photo controls and the routes answer 403', async ({
  page,
}) => {
  await login(page, tomId)
  await page.goto(`/trips/${japanTrip}`)
  const first = page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Nara Park/ })
  await first.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('quota-counter')).toBeVisible()
  await expect(
    dialog.getByRole('link', { name: 'Find images on Google' }),
  ).toHaveCount(0)
  await expect(
    dialog.getByRole('button', { name: 'Suggested photos' }),
  ).toHaveCount(0)

  const statuses = await page.evaluate(async (trip) => {
    const spots = (await (
      await fetch(`/api/trips/${trip}/spots`, { credentials: 'include' })
    ).json()) as { spots: { id: string }[] }
    const spotId = spots.spots[0].id
    const post = async (path: string, body: unknown) =>
      (
        await fetch(path, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).status
    return [
      (
        await fetch(
          `/api/trips/${trip}/photo-suggestions?lat=35.0394&lng=135.7292`,
          { credentials: 'include' },
        )
      ).status,
      await post(`/api/spots/${spotId}/images/from-url`, {
        url: 'http://fixtures.tripboard.test/photo.jpg',
      }),
      await post(`/api/spots/${spotId}/images/from-commons`, {
        fileTitle: 'File:Kinkaku-ji Golden Pavilion.jpg',
      }),
    ]
  }, japanTrip)
  expect(statuses).toEqual([403, 403, 403])
})

async function drop(page: Page, data: Record<string, string>) {
  await page.evaluate((entries) => {
    const zone = document.querySelector('[data-testid="image-drop"]')
    if (!(zone instanceof HTMLElement)) throw new Error('missing drop zone')
    const transfer = new DataTransfer()
    for (const [type, value] of Object.entries(entries)) {
      transfer.setData(type, value)
    }
    zone.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    )
  }, data)
}

async function pastePng(page: Page) {
  await page.evaluate((base64) => {
    const zone = document.activeElement
    if (!(zone instanceof HTMLElement)) throw new Error('nothing focused')
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }))
    zone.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
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
