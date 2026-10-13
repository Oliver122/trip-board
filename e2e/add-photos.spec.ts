import { expectNoSeriousViolations } from './a11y'
import { answerConfirm } from './confirm'
import { expect, test, type Page } from './fixtures'
import { waitForMap } from './map'
import { dispatchPaste } from './clipboard'

const planner = '100000000000000002'
const photoUrl = 'http://fixtures.tripboard.test/photo.jpg'
const missingUrl = 'http://fixtures.tripboard.test/missing.jpg'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockGeocode(page)
})

// T-34-09
test('T-34-09 a queued suggestion and a dropped link become the new spot gallery', async ({
  page,
}) => {
  await login(page, planner)
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Add photos')
  await page.goto(`/trips/${tripId}`)
  await waitForMap(page)
  await openKinkakuji(page)
  const dialog = page.getByRole('dialog', { name: 'New spot' })

  await dialog.getByRole('button', { name: 'Suggested photos' }).click()
  await dialog.getByRole('button', { name: 'Add image by Jane Doe' }).click()
  await drop(page, { 'text/uri-list': photoUrl })
  await expect(
    dialog.getByTestId('queued-photos').getByRole('img'),
  ).toHaveCount(2)

  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByTestId('spot-list').getByRole('button', { name: /Kinkaku-ji/ }),
  ).toBeVisible()

  await expect
    .poll(async () => (await spotImages(page, tripId, 'Kinkaku-ji')).length)
    .toBe(2)
  const images = await spotImages(page, tripId, 'Kinkaku-ji')
  expect(images[0]?.sourceUrl).toContain('commons.wikimedia.org')
  expect(images[1]?.sourceUrl).toBe(photoUrl)

  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Kinkaku-ji/ })
    .click()
  await expect(
    page.getByRole('button', { name: 'Photo', exact: true }),
  ).toHaveCount(2)
})

test('T-34-09 a spot filled from a Maps link opens the suggestions at once', async ({
  page,
}) => {
  await fakeResolver(page)
  await login(page, planner)
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Link photos')
  await page.goto(`/trips/${tripId}`)
  await waitForMap(page)
  await dispatchPaste(
    page,
    { text: 'Kinkaku-ji\nhttps://maps.app.goo.gl/kinkaku' },
    'body',
  )
  const dialog = page.getByRole('dialog', { name: 'New spot' })
  await expect(dialog.getByLabel('Title')).toHaveValue('Kinkaku-ji')
  await expect(
    dialog.getByRole('button', { name: 'Suggested photos' }),
  ).toHaveAttribute('aria-expanded', 'true')
  await expect(
    dialog.getByRole('button', { name: 'Add image by Jane Doe' }),
  ).toBeVisible()
})

test('T-34-09 a queued link that answers 404 keeps the spot and names the failure', async ({
  page,
}) => {
  await login(page, planner)
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Failed photo')
  await page.goto(`/trips/${tripId}`)
  await waitForMap(page)
  await openKinkakuji(page)
  const dialog = page.getByRole('dialog', { name: 'New spot' })
  await drop(page, { 'text/uri-list': missingUrl })
  await expect(
    dialog.getByTestId('queued-photos').getByRole('img'),
  ).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('toast')).toContainText(
    'Spot added. 1 photo could not be added:',
  )
  await expect(
    page.getByTestId('spot-list').getByRole('button', { name: /Kinkaku-ji/ }),
  ).toBeVisible()
  expect(await spotImages(page, tripId, 'Kinkaku-ji')).toHaveLength(0)
})

test('T-34-09 a queued photo makes Cancel ask to discard', async ({ page }) => {
  await login(page, planner)
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Cancel photos')
  await page.goto(`/trips/${tripId}`)
  await waitForMap(page)
  await page.getByTestId('add-new').click()
  await page.getByRole('combobox', { name: 'Address' }).fill('kinkaku')
  await page.getByRole('option', { name: /Kinkaku-ji/ }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await answerConfirm(page, 'accept')

  await openKinkakuji(page)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await answerConfirm(page, 'accept')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await openKinkakuji(page)
  await drop(page, { 'text/uri-list': photoUrl })
  await expect(page.getByTestId('queued-photos')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    'Discard unsaved changes?',
  )
  await answerConfirm(page, 'dismiss')
  await expect(page.getByRole('dialog', { name: 'New spot' })).toBeVisible()
})

// T-34-11, add-panel part
for (const scheme of ['light', 'dark'] as const) {
  test(`T-34-11 axe finds no serious issues on the add panel with two queued photos in ${scheme} mode`, async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.emulateMedia({ colorScheme: scheme })
    await login(page, planner)
    await setLocale(page, 'en')
    const tripId = await createTrip(page, `Photos a11y ${scheme}`)
    await page.goto(`/trips/${tripId}`)
    await waitForMap(page)
    await openKinkakuji(page)
    const dialog = page.getByRole('dialog', { name: 'New spot' })
    await dialog.getByRole('button', { name: 'Suggested photos' }).click()
    await dialog.getByRole('button', { name: 'Add image by Jane Doe' }).click()
    await drop(page, { 'text/uri-list': photoUrl })
    const queued = dialog.getByTestId('queued-photos')
    await expect(queued.getByRole('img')).toHaveCount(2)
    await expect(queued.getByRole('button', { name: /^Remove / })).toHaveCount(
      2,
    )
    await expect(
      dialog.getByRole('button', { name: /^Add image by / }).first(),
    ).toBeVisible()
    await expectNoSeriousViolations(page, `add panel photos ${scheme}`)
  })
}

async function openKinkakuji(page: Page) {
  await page.getByTestId('add-new').click()
  await page.getByRole('combobox', { name: 'Address' }).fill('kinkaku')
  await page.getByRole('option', { name: /Kinkaku-ji/ }).click()
  await page.getByLabel('Title').fill('Kinkaku-ji')
  await expect(page.getByTestId('draft-photos')).toBeVisible()
}

async function drop(page: Page, data: Record<string, string>) {
  await page.evaluate((entries) => {
    const zone = document.querySelector('[data-testid="draft-image-drop"]')
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

async function spotImages(page: Page, tripId: string, title: string) {
  return page.evaluate(
    async ({ id, wanted }) => {
      const list = (await (
        await fetch(`/api/trips/${id}/spots`, { credentials: 'include' })
      ).json()) as { spots: { id: string; title: string }[] }
      const spot = list.spots.find((entry) => entry.title === wanted)
      if (!spot) return []
      const body = (await (
        await fetch(`/api/spots/${spot.id}/images`, { credentials: 'include' })
      ).json()) as { images: { sourceUrl: string | null }[] }
      return body.images
    },
    { id: tripId, wanted: title },
  )
}

async function fakeResolver(page: Page) {
  await page.route('**/api/trips/*/places/from-link', (route) =>
    route.fulfill({
      json: {
        title: 'Kinkaku-ji',
        address: '1 Kinkakujicho, Kita Ward, Kyoto',
        lat: 35.0394,
        lng: 135.7292,
        link: 'https://maps.app.goo.gl/kinkaku',
        placed: true,
      },
    }),
  )
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

async function mockGeocode(page: Page) {
  await page.route('**/api/geocode/search**', (route) =>
    route.fulfill({
      json: {
        results: [
          {
            label: 'Kinkaku-ji, Kita Ward, Kyoto',
            lat: 35.0394,
            lng: 135.7292,
          },
        ],
      },
    }),
  )
  await page.route('**/api/geocode/reverse**', (route) =>
    route.fulfill({
      json: { label: 'Kyoto, Japan', lat: 35, lng: 135.75 },
    }),
  )
}
