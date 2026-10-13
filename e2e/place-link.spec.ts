import { answerConfirm } from './confirm'
import { expect, test, type Page } from './fixtures'
import { showLocale } from './locale'
import { waitForMap } from './map'
import { dispatchPaste } from './clipboard'

const shareText =
  'Kinkaku-ji\n1 Kinkakujicho, Kita Ward, Kyoto\nhttps://maps.app.goo.gl/kinkaku'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockGeocode(page)
})

// T-33-05
test('T-33-05 pasting a Maps share text opens the filled add panel', async ({
  page,
}) => {
  const lookups = await fakeResolver(page)
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Paste place')
  await page.goto(`/trips/${tripId}`)
  await waitForMap(page)

  await paste(page, shareText)
  await expect(page.getByTestId('toast')).toHaveText(/Looking up place/)
  const dialog = page.getByRole('dialog', { name: 'New spot' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Title')).toHaveValue('Kinkaku-ji')
  await expect(page.getByRole('combobox', { name: 'Address' })).toHaveValue(
    '1 Kinkakujicho, Kita Ward, Kyoto',
  )
  await expect(dialog.getByLabel('Link', { exact: true })).toHaveValue(
    'https://maps.app.goo.gl/kinkaku',
  )
  await expect(page.getByTestId('draft-pin')).toBeVisible()
  await expect
    .poll(async () => {
      const center = await mapCenter(page)
      return Math.abs(center.lat - 35.0394) + Math.abs(center.lng - 135.7292)
    })
    .toBeLessThan(0.05)

  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const spot = await spotByTitle(page, tripId, 'Kinkaku-ji')
  expect(spot.link).toBe('https://maps.app.goo.gl/kinkaku')
  expect(lookups()).toBe(1)
})

test('T-33-05 other text and pastes into inputs are ignored', async ({
  page,
}) => {
  const lookups = await fakeResolver(page)
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Paste ignored')
  await createSpot(page, tripId, 'Anchor spot')
  await page.goto(`/trips/${tripId}`)
  await waitForMap(page)

  await paste(page, 'hello')
  await page.waitForTimeout(300)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('toast')).toHaveCount(0)

  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const search = page.getByRole('searchbox', { name: 'Search' })
  await search.focus()
  await paste(page, shareText)
  await page.waitForTimeout(300)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(lookups()).toBe(0)
})

test('T-33-05 a paste over unsaved edits asks to discard first', async ({
  page,
}) => {
  const lookups = await fakeResolver(page)
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Paste discard')
  await createSpot(page, tripId, 'Dirty spot')
  await page.goto(`/trips/${tripId}`)
  await waitForMap(page)
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Dirty spot/ })
    .click()
  await page.getByLabel('Title').fill('Dirty spot edited')
  await page.getByRole('heading', { name: 'Edit spot' }).click()

  await paste(page, shareText)
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    'Discard unsaved changes?',
  )
  expect(lookups()).toBe(0)
  await answerConfirm(page, 'dismiss')
  await expect(page.getByLabel('Title')).toHaveValue('Dirty spot edited')

  await paste(page, shareText)
  await answerConfirm(page, 'accept')
  await expect(page.getByRole('dialog', { name: 'New spot' })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue('Kinkaku-ji')
})

test('T-33-05 a visitor pasting a link gets nothing', async ({ page }) => {
  const lookups = await fakeResolver(page)
  await login(page, '100000000000000003')
  await page.goto('/trips/10000000-0000-0000-0000-000000000001')
  await waitForMap(page)
  await paste(page, shareText)
  await page.waitForTimeout(300)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(lookups()).toBe(0)
})

// T-33-06
test('T-33-06 the Google Maps link field fills the add panel', async ({
  page,
}) => {
  await fakeResolver(page)
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Field place')
  await page.goto(`/trips/${tripId}`)
  await waitForMap(page)
  await page.getByTestId('add-new').click()
  const dialog = page.getByRole('dialog', { name: 'New spot' })
  await dialog.getByLabel('Title').fill('Golden Pavilion')

  const field = dialog.getByLabel('Google Maps link')
  await field.fill('https://maps.app.goo.gl/kinkaku')
  await dialog.getByRole('button', { name: 'Fill in' }).click()
  await expect(dialog.getByLabel('Title')).toHaveValue('Golden Pavilion')
  await expect(page.getByRole('combobox', { name: 'Address' })).toHaveValue(
    '1 Kinkakujicho, Kita Ward, Kyoto',
  )
  await expect(page.getByTestId('draft-pin')).toBeVisible()
  await expect(dialog.getByLabel('Link', { exact: true })).toHaveValue(
    'https://maps.app.goo.gl/kinkaku',
  )

  await page.getByRole('button', { name: 'Cancel' }).click()
  await answerConfirm(page, 'accept')
  await page.getByTestId('add-new').click()
  await field.fill('https://maps.app.goo.gl/unplaced')
  await dialog.getByRole('button', { name: 'Fill in' }).click()
  await expect(page.getByTestId('link-unplaced')).toHaveText(
    "Couldn't place this on the map. Click the map to set the pin.",
  )
  await expect(page.getByTestId('draft-pin')).toHaveCount(0)
  await expect(dialog.getByLabel('Title')).toHaveValue('Unplaceable')

  await field.fill('https://example.com')
  await dialog.getByRole('button', { name: 'Fill in' }).click()
  await expect(page.getByTestId('maps-link-error')).toHaveText(
    'This is not a Google Maps link.',
  )
})

test('T-33-06 the field errors are German in German', async ({ page }) => {
  await fakeResolver(page)
  await showLocale(page, 'de')
  await login(page, '100000000000000002')
  const tripId = await createTrip(page, 'Feld Ort')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId('add-new').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Google-Maps-Link').fill('https://example.com')
  await dialog.getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByTestId('maps-link-error')).toHaveText(
    'Das ist kein Google-Maps-Link.',
  )
})

// R-33-08, board half
test('R-33-08 addFrom opens the panel and drops its parameters', async ({
  page,
}) => {
  await fakeResolver(page)
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Add from')
  const from = encodeURIComponent('https://maps.app.goo.gl/kinkaku')
  await page.goto(`/trips/${tripId}?addFrom=${from}&text=Kinkaku-ji`)
  await expect(page.getByRole('dialog', { name: 'New spot' })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue('Kinkaku-ji')
  await expect(page).not.toHaveURL(/addFrom|text=/)
})

test('R-33-08 addFrom as visitor opens nothing and drops its parameters', async ({
  page,
}) => {
  const lookups = await fakeResolver(page)
  await login(page, '100000000000000003')
  const from = encodeURIComponent('https://maps.app.goo.gl/kinkaku')
  await page.goto(
    `/trips/10000000-0000-0000-0000-000000000001?addFrom=${from}&text=x`,
  )
  await expect(page.getByTestId('spot-list')).toBeVisible()
  await expect(page).not.toHaveURL(/addFrom|text=/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(lookups()).toBe(0)
})

/** The fake resolver: Kinkaku-ji, an unplaceable place, or a non-Maps 400. */
async function fakeResolver(page: Page): Promise<() => number> {
  let calls = 0
  await page.route('**/api/trips/*/places/from-link', async (route) => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 400))
    const body = route.request().postData() ?? ''
    if (body.includes('example.com')) {
      await route.fulfill({
        status: 400,
        json: { error: 'link_not_google_maps' },
      })
      return
    }
    if (body.includes('unplaced')) {
      await route.fulfill({
        json: {
          title: 'Unplaceable',
          address: null,
          lat: null,
          lng: null,
          link: 'https://maps.app.goo.gl/unplaced',
          placed: false,
        },
      })
      return
    }
    await route.fulfill({
      json: {
        title: 'Kinkaku-ji',
        address: '1 Kinkakujicho, Kita Ward, Kyoto',
        lat: 35.0394,
        lng: 135.7292,
        link: 'https://maps.app.goo.gl/kinkaku',
        placed: true,
      },
    })
  })
  return () => calls
}

async function paste(page: Page, text: string) {
  await dispatchPaste(page, { text })
}

async function mapCenter(page: Page) {
  return page.evaluate(() => {
    const map = (
      window as unknown as {
        __tripboardMap: { getCenter: () => { lng: number; lat: number } }
      }
    ).__tripboardMap
    const center = map.getCenter()
    return { lng: center.lng, lat: center.lat }
  })
}

async function spotByTitle(page: Page, tripId: string, title: string) {
  return page.evaluate(
    async ({ id, wanted }) => {
      const response = await fetch(`/api/trips/${id}/spots`, {
        credentials: 'include',
      })
      const body = (await response.json()) as {
        spots: { title: string; link: string | null }[]
      }
      const found = body.spots.find((spot) => spot.title === wanted)
      if (!found) throw new Error(`no spot ${wanted}`)
      return found
    },
    { id: tripId, wanted: title },
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

async function createSpot(page: Page, tripId: string, title: string) {
  await page.evaluate(
    async ({ id, spotTitle }) => {
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
    { id: tripId, spotTitle: title },
  )
}

async function mockGeocode(page: Page) {
  await page.route('**/api/geocode/reverse**', (route) =>
    route.fulfill({
      json: { label: 'Kyoto, Japan', lat: 35, lng: 135.75 },
    }),
  )
}
