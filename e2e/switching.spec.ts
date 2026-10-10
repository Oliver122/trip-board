import { answerConfirm } from './confirm'
import { expect, test, type Page } from './fixtures'
import { waitForMap } from './map'

const aikoId = '100000000000000002'
const tomId = '100000000000000003'
const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockGeocode(page)
})

test('T-25-01 a right-click on the map starts a spot at that point', async ({
  page,
}) => {
  const trip = await openTrip(page, aikoId, 'Right click add')
  await page.locator('.maplibregl-canvas').click({
    button: 'right',
    position: { x: 80, y: 180 },
  })
  await expect(page.getByRole('dialog', { name: 'New spot' })).toBeVisible()
  await expect(page.getByTestId('draft-pin')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Address' })).toHaveValue(
    'Kyoto, Japan',
  )
  await titleField(page).fill('Right-clicked')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const spots = await listSpots(page, trip)
  const saved = spots.find((spot) => spot.title === 'Right-clicked')
  expect(saved?.lng).toBeGreaterThan(135)
  expect(saved?.lng).toBeLessThan(140)
})

test('T-25-02 a right-click on a pin starts nothing, and a visitor keeps the browser menu', async ({
  page,
}) => {
  const trip = await openTrip(page, aikoId, 'Right click pin')
  const [first] = await listSpots(page, trip)
  await page.getByTestId(`pin-${first.id}`).click({ button: 'right' })
  await expect(page.getByRole('dialog', { name: 'New spot' })).toHaveCount(0)
  await expect(page.getByTestId('draft-pin')).toHaveCount(0)

  await login(page, tomId)
  await page.goto(japanTrip)
  await waitForMap(page)
  const prevented = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const canvas = document.querySelector('.maplibregl-canvas')
        const box = canvas?.getBoundingClientRect()
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: (box?.left ?? 0) + 80,
          clientY: (box?.top ?? 0) + 180,
        })
        canvas?.dispatchEvent(event)
        resolve(event.defaultPrevented)
      }),
  )
  expect(prevented).toBe(false)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('T-25-03 a clean panel switches spots at once', async ({ page }) => {
  const trip = await openTrip(page, aikoId, 'Clean switch')
  const [first, second] = await listSpots(page, trip)
  await mapStill(page)
  await page.getByTestId(`pin-${first.id}`).click()
  await expect(titleField(page)).toHaveValue(first.title)
  await mapStill(page)
  await page.getByTestId(`pin-${second.id}`).click()
  await expect(titleField(page)).toHaveValue(second.title)
  await card(page, first.id)
  await expect(titleField(page)).toHaveValue(first.title)

  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByTestId('add-new').click()
  const canvas = page.locator('.maplibregl-canvas')
  await canvas.click({ button: 'right', position: { x: 80, y: 180 } })
  const pin = page.getByTestId('draft-pin')
  await expect(pin).toBeVisible()
  const before = await pin.boundingBox()
  await canvas.click({ button: 'right', position: { x: 300, y: 300 } })
  await expect
    .poll(async () => (await pin.boundingBox())?.x ?? 0)
    .not.toBe(before?.x)
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
})

for (const via of ['pin', 'card', 'right-click'] as const) {
  test(`T-25-04 unsaved changes ask first when switching by ${via}`, async ({
    page,
  }) => {
    const trip = await openTrip(page, aikoId, `Dirty ${via}`)
    const [first, second] = await listSpots(page, trip)
    await mapStill(page)
    await page.getByTestId(`pin-${first.id}`).click()
    await titleField(page).fill('Edited title')

    const trigger = async () => {
      if (via === 'pin') {
        await mapStill(page)
        await page.getByTestId(`pin-${second.id}`).click()
      } else if (via === 'card') await card(page, second.id)
      else {
        await page
          .locator('.maplibregl-canvas')
          .click({ button: 'right', position: { x: 80, y: 180 } })
      }
    }

    await trigger()
    await expect(page.getByTestId('confirm-dialog')).toContainText(
      'Discard unsaved changes?',
    )
    await answerConfirm(page, 'dismiss')
    await expect(titleField(page)).toHaveValue('Edited title')

    await trigger()
    await answerConfirm(page, 'accept')
    if (via === 'right-click') {
      await expect(page.getByRole('dialog', { name: 'New spot' })).toBeVisible()
    } else {
      await expect(titleField(page)).toHaveValue(second.title)
    }
    const after = await listSpots(page, trip)
    expect(after.find((spot) => spot.id === first.id)?.title).toBe(first.title)
  })
}

test('T-25-05 left-click moves the pin, and a pending save blocks switching', async ({
  page,
}) => {
  const trip = await openTrip(page, aikoId, 'Save lock')
  const [first, second] = await listSpots(page, trip)
  await mapStill(page)
  await page.getByTestId(`pin-${first.id}`).click()
  const pin = page.getByTestId('draft-pin')
  const before = await pin.boundingBox()
  await page
    .locator('.maplibregl-canvas')
    .click({ position: { x: 300, y: 300 } })
  await expect
    .poll(async () => (await pin.boundingBox())?.x ?? 0)
    .not.toBe(before?.x)

  await page.route('**/api/spots/*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return route.fallback()
  })
  await page.getByRole('button', { name: 'Save' }).click()
  await mapStill(page)
  await page.getByTestId(`pin-${second.id}`).click()
  await expect(titleField(page)).toHaveValue(first.title)
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 })
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
})

// A spot opens with the map easing to it; pins are not clickable until it stops.
async function mapStill(page: Page) {
  await page.waitForFunction(() => {
    const map = (
      window as unknown as { __tripboardMap?: { isMoving: () => boolean } }
    ).__tripboardMap
    return map ? !map.isMoving() : false
  })
}

// The open panel covers the list on this viewport, so the card is clicked
// through the DOM; what matters here is what the app does with the click.
async function card(page: Page, id: string) {
  await page.getByTestId(`card-${id}`).dispatchEvent('click')
}

type Listed = { id: string; title: string }

function titleField(page: Page) {
  return page.getByRole('textbox', { name: 'Title', exact: true })
}

async function openTrip(page: Page, discordId: string, name: string) {
  await login(page, discordId)
  const trip = await page.evaluate(async (tripName) => {
    const post = async (path: string, body: unknown) => {
      const response = await fetch(`/api${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(await response.text())
      return (await response.json()) as { id: string }
    }
    const created = await post('/trips', {
      name: tripName,
      timezone: 'Asia/Tokyo',
      region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
    })
    for (const [title, lng, lat] of [
      ['First spot', 135.54, 34.84],
      ['Second spot', 135.5, 34.82],
    ] as const) {
      await post(`/trips/${created.id}/spots`, {
        title,
        lat,
        lng,
        baseCategory: 'maybe',
        address: 'Japan',
      })
    }
    return created.id
  }, name)
  await page.goto(`/trips/${trip}`)
  await waitForMap(page)
  // Zoomed in so the two pins do not sit on top of each other.
  await page.evaluate(() => {
    const map = (
      window as unknown as {
        __tripboardMap?: { jumpTo: (options: object) => void }
      }
    ).__tripboardMap
    map?.jumpTo({ center: [135.52, 34.83], zoom: 11 })
  })
  await mapStill(page)
  return trip
}

async function listSpots(page: Page, trip: string) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/trips/${id}/spots`, {
      credentials: 'include',
    })
    const body = (await response.json()) as {
      spots: Array<{ id: string; title: string; lng: number }>
    }
    return body.spots
  }, trip) as Promise<Array<Listed & { lng: number }>>
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

async function mockGeocode(page: Page) {
  await page.route('**/api/geocode/reverse**', (route) =>
    route.fulfill({
      json: { label: 'Kyoto, Japan', lat: 35, lng: 135.75 },
    }),
  )
}
