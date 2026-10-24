import { expect, test, type Locator, type Page } from './fixtures'

// T-42-13: schedule rows with one indent and a ⋯ menu at 390 and 1280

for (const width of [390, 1280]) {
  test(`T-42-13 rows share one indent and end in a menu at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await login(page, '100000000000000002')
    await setLocale(page, 'en')
    const tripId = await createTrip(page, `Rows ${width}`)
    const first = await createSpot(page, tripId, 'Alpha Spot', 35.65, 139.7)
    const second = await createSpot(page, tripId, 'Beta Spot', 35.66, 139.71)
    const entryId = await createEntry(page, tripId, 'bucket', 'Tokyo')
    const singleId = await createEntry(page, tripId, 'single', 'Arrival')
    const firstLink = await addVisit(page, entryId, first, '2026-04-13')
    const secondLink = await addVisit(page, entryId, second, '2026-04-14')
    await page.goto(`/trips/${tripId}/schedule`)
    await expect(page.getByTestId(`visit-${firstLink}`)).toBeVisible()

    // one left edge for titles, rows and every Add spot
    const lefts = [
      await left(page.getByTestId(`entry-${entryId}`)),
      await left(page.getByTestId(`entry-${singleId}`)),
      await left(page.getByTestId(`visit-${firstLink}`)),
      await left(page.getByTestId(`visit-${secondLink}`)),
      await left(page.getByTestId(`add-spot-${entryId}`)),
      await left(page.getByTestId(`add-spot-${singleId}`)),
    ]
    for (const value of lefts) {
      expect(Math.abs(value - lefts[0]!)).toBeLessThanOrEqual(1)
    }

    // each row shows the kind strip
    await expect(
      page.getByTestId(`visit-${firstLink}`).getByTestId('category-strip'),
    ).toBeVisible()

    const menu = page.getByRole('button', { name: 'Actions for Alpha Spot' })
    const box = await menu.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    await menu.click()
    await expect(page.getByRole('menuitem', { name: 'Move up' })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'Move down' }).click()
    await expect
      .poll(() =>
        page.locator('[data-testid^="visit-title-"]').allTextContents(),
      )
      .toEqual(['Beta Spot', 'Alpha Spot'])
    await expect(page.getByTestId(`row-menu-${firstLink}`)).toBeFocused()
    await expect(page.getByTestId('reorder-live')).toContainText(
      'Alpha Spot moved to position 2 of 2',
    )

    // Remove from bucket is neutral and removes the row
    await page.getByTestId(`row-menu-${firstLink}`).click()
    const remove = page.getByRole('menuitem', { name: 'Remove from bucket' })
    const color = await remove.evaluate((el) => getComputedStyle(el).color)
    const text = await page
      .getByTestId(`visit-title-${secondLink}`)
      .evaluate((el) => getComputedStyle(el).color)
    expect(color).toBe(text)
    await remove.click()
    await expect(page.getByTestId(`visit-${firstLink}`)).toHaveCount(0)
  })
}

async function left(locator: Locator) {
  const box = await locator.boundingBox()
  return box!.x
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

/** POSTs JSON as the signed-in user and returns the parsed body. */
function post(page: Page, url: string, payload: unknown) {
  return page.evaluate(
    async ({ url: target, payload: body }) => {
      const response = await fetch(target, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(await response.text())
      return (await response.json()) as { id: string }
    },
    { url, payload },
  )
}

async function createTrip(page: Page, name: string) {
  const trip = await post(page, '/api/trips', {
    name,
    timezone: 'Asia/Tokyo',
    region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
  })
  return trip.id
}

async function createSpot(
  page: Page,
  tripId: string,
  title: string,
  lat: number,
  lng: number,
) {
  const spot = await post(page, `/api/trips/${tripId}/spots`, {
    title,
    lat,
    lng,
    baseCategory: 'maybe',
    address: 'Tokyo',
  })
  return spot.id
}

async function createEntry(
  page: Page,
  tripId: string,
  type: 'bucket' | 'single',
  title: string,
) {
  const entry = await post(page, `/api/trips/${tripId}/plan`, {
    type,
    title,
    startDate: '2026-04-12',
    ...(type === 'bucket' ? { endDate: '2026-04-16' } : {}),
  })
  return entry.id
}

async function addVisit(
  page: Page,
  entryId: string,
  spotId: string,
  visitDate: string,
) {
  const link = await post(page, `/api/plan/${entryId}/spots`, {
    spotId,
    visitDate,
  })
  return link.id
}
