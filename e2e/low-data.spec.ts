import { expect, test, type Page } from '@playwright/test'
import {
  deleteCreatedTrips,
  fakeAvatars,
  heavyRequest,
  login,
  freshUser,
  planner,
  png,
  recordRequests,
  tripWithPhotos,
} from './low-data'
import { dispatchPaste } from './clipboard'
import { waitForMap } from './map'

const japan = '10000000-0000-0000-0000-000000000001'

async function lowDataOn(page: Page) {
  await page.addInitScript(() => localStorage.setItem('dataSaver', 'on'))
}

/** The phone's panel keeps *Photos* collapsed until it is opened (R-38-04). */
async function openPhotos(page: Page) {
  const section = page.getByRole('button', { name: /^Photos/ })
  if ((await section.count()) > 0) await section.click()
}

async function openSpot(page: Page, title: RegExp) {
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: title })
    .click()
  await expect(page.getByRole('dialog', { name: 'Edit spot' })).toBeVisible()
}

test.afterEach(async ({ page }) => {
  await deleteCreatedTrips(page)
})

const desktop = { width: 1280, height: 800 }
const phone = { width: 390, height: 844 }

test('T-38-06 the avatar menu turns low data on, the account page shows it, auto follows saveData', async ({
  page,
}) => {
  await page.setViewportSize(desktop)
  await login(page, planner)
  await page.goto(`/trips/${japan}`)
  await expect(page.getByTestId('data-saver-badge')).toHaveCount(0)
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByTestId('data-saver-menu-item').click()
  await expect(page.getByTestId('data-saver-badge')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('dataSaver'))).toBe(
    'on',
  )

  await page.getByTestId('data-saver-badge').click()
  await expect(page).toHaveURL(/\/account/)
  const setting = page.getByTestId('data-saver-setting')
  await expect(setting.getByRole('radio', { name: 'On' })).toBeChecked()
  await expect(setting.getByRole('radio')).toHaveCount(3)
  await setting.getByRole('radio', { name: 'Automatic' }).check()
  await expect(page.getByTestId('data-saver-badge')).toHaveCount(0)
})

test('T-38-06 an emulated saveData connection with auto shows the badge', async ({
  page,
}) => {
  await page.setViewportSize(desktop)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      value: Object.assign(new EventTarget(), {
        saveData: true,
        effectiveType: '4g',
      }),
      configurable: true,
    })
  })
  await login(page, planner)
  await page.goto(`/trips/${japan}`)
  await expect(page.getByTestId('data-saver-badge')).toBeVisible()
})

test('T-38-06 turning low data off loads the map and photos without a reload', async ({
  page,
}) => {
  await page.setViewportSize(desktop)
  await login(page, freshUser())
  const { tripId } = await tripWithPhotos(page, 'Low data off')
  await lowDataOn(page)
  await page.goto(`/trips/${tripId}`)
  await expect(page.getByTestId('map-gate')).toBeVisible()
  await openSpot(page, /Kinkaku-ji/)
  await expect(page.getByTestId('photo-placeholder')).toHaveCount(3)

  // The open panel covers the avatar button at 1280 px, so use the keyboard.
  await page.getByRole('button', { name: 'Account menu' }).focus()
  await page.keyboard.press('Enter')
  await page.getByTestId('data-saver-menu-item').focus()
  await page.keyboard.press('Enter')
  await waitForMap(page)
  await expect(page.getByTestId('photo-placeholder')).toHaveCount(0)
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Photo', exact: true }),
  ).toHaveCount(3)
})

for (const [label, size] of [
  ['1280 px', desktop],
  ['390 px', phone],
] as const) {
  test(`T-38-07 low data requests no heavy resources at ${label}`, async ({
    page,
  }) => {
    await page.setViewportSize(size)
    await fakeAvatars(page)
    await login(page, freshUser())
    const { tripId } = await tripWithPhotos(page, `Quiet ${label}`)
    await lowDataOn(page)
    const urls = recordRequests(page)
    await page.goto(`/trips/${tripId}${size === phone ? '?view=list' : ''}`)
    await openSpot(page, /Kinkaku-ji/)
    await openPhotos(page)
    await expect(page.getByTestId('photo-placeholder')).toHaveCount(3)
    await expect(page.getByTestId('map-gate'))
      .toBeVisible()
      .catch(() => {})
    await page.waitForTimeout(500)
    expect(urls.filter((url) => heavyRequest.test(url))).toEqual([])
    const avatars = page.getByTestId('member-avatar')
    if ((await avatars.count()) > 0) {
      await expect(avatars.first().locator('img')).toHaveCount(0)
    }
  })
}

test('T-38-07 pins show their symbol without the atlas', async ({ page }) => {
  await page.setViewportSize(desktop)
  await login(page, freshUser())
  const { tripId } = await tripWithPhotos(page, 'Pins', 0)
  await lowDataOn(page)
  const urls = recordRequests(page)
  await page.goto(`/trips/${tripId}`)
  await page.getByRole('button', { name: 'Load map' }).click()
  await waitForMap(page)
  const pin = page.getByRole('button', { name: /^Kinkaku-ji/ }).first()
  await expect(pin).toBeVisible()
  await expect(pin.locator('[data-texture]')).toHaveCount(0)
  expect(urls.filter((url) => /kind-symbols\.png/.test(url))).toEqual([])
})

test('T-38-08 placeholders load one photo, then all, and an upload needs no GET', async ({
  page,
}) => {
  await page.setViewportSize(desktop)
  await login(page, freshUser())
  const { tripId } = await tripWithPhotos(page, 'Placeholders')
  await lowDataOn(page)
  const files: string[] = []
  page.on('request', (request) => {
    if (/\/images\/[^/]+\/file/.test(request.url())) {
      files.push(request.url())
    }
  })
  await page.goto(`/trips/${tripId}`)
  await openSpot(page, /Kinkaku-ji/)
  const dialog = page.getByRole('dialog')
  const placeholders = dialog.getByTestId('photo-placeholder')
  await expect(placeholders).toHaveCount(3)
  await expect(placeholders.first()).toContainText(/\d+ kB/)
  await expect(
    dialog.getByRole('button', { name: /^Load all \(/ }),
  ).toBeVisible()
  expect(files).toEqual([])

  await placeholders.first().getByRole('button', { name: 'Load photo' }).click()
  await expect(placeholders).toHaveCount(2)
  await expect.poll(() => files.length).toBe(1)

  await dialog.getByRole('button', { name: /^Load all \(/ }).click()
  await expect(placeholders).toHaveCount(0)
  await expect.poll(() => files.length).toBe(3)

  const ids = () =>
    new Set(files.map((url) => /images\/([^/]+)\/file/.exec(url)?.[1]))
  const before = ids()
  await page.evaluate(async (file) => {
    const zone = document.querySelector('[data-testid="image-drop"]')
    if (!(zone instanceof HTMLElement)) throw new Error('missing drop zone')
    const transfer = new DataTransfer()
    const bytes = Uint8Array.from(atob(file), (char) => char.charCodeAt(0))
    transfer.items.add(new File([bytes], 'new.png', { type: 'image/png' }))
    zone.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    )
  }, png)
  await expect(
    dialog.getByRole('button', { name: 'Photo', exact: true }),
  ).toHaveCount(4)
  await page.waitForTimeout(300)
  // Old photos may be re-requested with a fresh signature; the new one is not.
  expect(ids()).toEqual(before)
  await expect(placeholders).toHaveCount(0)
})

test('T-38-08 photos already shown stay when low data turns on', async ({
  page,
}) => {
  await page.setViewportSize(desktop)
  await login(page, freshUser())
  const { tripId } = await tripWithPhotos(page, 'Stay shown', 2)
  await page.goto(`/trips/${tripId}`)
  await openSpot(page, /Kinkaku-ji/)
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('button', { name: 'Photo', exact: true }),
  ).toHaveCount(2)
  await page.evaluate(() => {
    localStorage.setItem('dataSaver', 'on')
    window.dispatchEvent(new StorageEvent('storage', { key: 'dataSaver' }))
  })
  await expect(dialog.getByTestId('photo-placeholder')).toHaveCount(0)
  await expect(
    dialog.getByRole('button', { name: 'Photo', exact: true }),
  ).toHaveCount(2)
})

test('T-38-09 at 1280 px the map area asks first and Load map loads it', async ({
  page,
}) => {
  await page.setViewportSize(desktop)
  await login(page, planner)
  await lowDataOn(page)
  const urls = recordRequests(page)
  await page.goto(`/trips/${japan}`)
  await expect(page.getByText('Load the map? Uses about 2–5 MB.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
  await page.waitForTimeout(300)
  expect(urls.filter((url) => /tiles\.openfreemap/.test(url))).toEqual([])

  await page.getByRole('button', { name: 'Load map' }).click()
  await waitForMap(page)
  await expect
    .poll(() => urls.some((url) => /tiles\.openfreemap/.test(url)))
    .toBe(true)
  await expect(page.getByTestId('map-gate')).toHaveCount(0)
})

test('T-38-09 at 390 px the board opens on List and Map asks first', async ({
  page,
}) => {
  await page.setViewportSize(phone)
  await login(page, planner)
  await lowDataOn(page)
  const urls = recordRequests(page)
  await page.goto(`/trips/${japan}`)
  await expect(page.getByTestId('spot-list')).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Trip sections' })
  await nav.getByRole('link', { name: 'Map' }).click()
  await expect(page.getByText('Load the map? Uses about 2–5 MB.')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(/view=list/)
  expect(urls.filter((url) => /tiles\.openfreemap/.test(url))).toEqual([])

  await nav.getByRole('link', { name: 'Map' }).click()
  await page.getByRole('button', { name: 'Load map' }).click()
  await waitForMap(page)
  await nav.getByRole('link', { name: 'List' }).click()
  await nav.getByRole('link', { name: 'Map' }).click()
  await expect(page.getByTestId('map-gate')).toHaveCount(0)
})

test('T-38-10 a pasted Maps link leaves the suggestions closed in low data', async ({
  page,
}) => {
  await page.setViewportSize(desktop)
  let suggestions = 0
  await page.route('**/api/trips/*/photo-suggestions*', (route) => {
    suggestions += 1
    return route.fulfill({ json: { suggestions: [] } })
  })
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
  await login(page, freshUser())
  const { tripId } = await tripWithPhotos(page, 'Paste low data', 0)
  await lowDataOn(page)
  await page.goto(`/trips/${tripId}`)
  await page.getByRole('button', { name: 'Load map' }).click()
  await waitForMap(page)
  await dispatchPaste(page, {
    text: 'Kinkaku-ji\nhttps://maps.app.goo.gl/kinkaku',
  })
  const dialog = page.getByRole('dialog', { name: 'New spot' })
  await expect(dialog.getByLabel('Title')).toHaveValue('Kinkaku-ji')
  const toggle = dialog.getByRole('button', { name: 'Suggested photos' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await page.waitForTimeout(500)
  expect(suggestions).toBe(0)
  await toggle.click()
  await expect.poll(() => suggestions).toBe(1)
})

test('T-38-10 at 390 px the gallery has no Google link and a camera-ready picker', async ({
  page,
}) => {
  await page.setViewportSize(phone)
  await login(page, freshUser())
  const { tripId } = await tripWithPhotos(page, 'Phone photos', 0)
  await page.goto(`/trips/${tripId}?view=list`)
  await openSpot(page, /Kinkaku-ji/)
  await openPhotos(page)
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('input[type="file"]')).toHaveAttribute(
    'accept',
    'image/*',
  )
  await expect(
    dialog.getByRole('link', { name: 'Find images on Google' }),
  ).toHaveCount(0)
  await page.setViewportSize(desktop)
  await expect(
    dialog.getByRole('link', { name: 'Find images on Google' }),
  ).toBeVisible()
})
