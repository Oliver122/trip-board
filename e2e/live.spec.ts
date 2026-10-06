import { expect, test, type Page } from '@playwright/test'

const sven = '100000000000000001'
const aiko = '100000000000000002'

test('T-19-08 a second member sees a new spot without moving the map', async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000)
  const { owner, guest, tripId, close } = await pair(browser, page)
  await owner.goto(`/trips/${tripId}`)
  await waitForMap(owner)
  await owner.evaluate(() => {
    const map = (
      window as unknown as {
        __tripboardMap?: { jumpTo: (options: object) => void }
      }
    ).__tripboardMap
    map?.jumpTo({ center: [139.75, 35.68], zoom: 11 })
  })
  await expect
    .poll(async () => owner.evaluate(() => location.hash))
    .toMatch(/^#\d/)
  const hash = await owner.evaluate(() => location.hash)
  const view = await mapView(owner)
  const title = `Live Pin ${Date.now()}`
  const spotId = await createSpot(guest, tripId, title, 35.68, 139.76)
  await expect(owner.getByTestId(`card-${spotId}`)).toBeVisible({
    timeout: 2_000,
  })
  await expect(owner.getByTestId(`pin-${spotId}`)).toBeVisible()
  expect(await owner.evaluate(() => location.hash)).toBe(hash)
  const after = await mapView(owner)
  expect(after.zoom).toBeCloseTo(view.zoom, 1)
  expect(after.lat).toBeCloseTo(view.lat, 2)
  expect(after.lng).toBeCloseTo(view.lng, 2)
  await close()
})

test('T-19-09 a reorder on one schedule shows up on the other', async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000)
  const { owner, guest, tripId, close } = await pair(browser, page)
  const firstTitle = `Alpha ${Date.now()}`
  const secondTitle = `Beta ${Date.now()}`
  const first = await createSpot(owner, tripId, firstTitle, 35.65, 139.7)
  const second = await createSpot(owner, tripId, secondTitle, 35.66, 139.71)
  const entryId = await createBucket(
    owner,
    tripId,
    'Tokyo',
    '2026-04-12',
    '2026-04-16',
  )
  const firstLink = await addVisit(owner, entryId, first, '2026-04-13')
  await addVisit(owner, entryId, second, '2026-04-14')
  await owner.goto(`/trips/${tripId}/schedule`)
  await guest.goto(`/trips/${tripId}/schedule`)
  await expect.poll(() => visitTitles(owner)).toEqual([firstTitle, secondTitle])
  await expect.poll(() => visitTitles(guest)).toEqual([firstTitle, secondTitle])
  await guest.getByTestId(`move-down-${firstLink}`).click()
  await expect.poll(() => visitTitles(owner)).toEqual([secondTitle, firstTitle])
  await close()
})

test('T-19-10 saving over someone else opens a conflict and use mine wins', async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000)
  const { owner, guest, tripId, close } = await pair(browser, page)
  const spotId = await createSpot(owner, tripId, 'Shared spot', 35.68, 139.76)
  await owner.goto(`/trips/${tripId}`)
  await guest.goto(`/trips/${tripId}`)
  await owner.getByTestId(`card-${spotId}`).click()
  await titleField(owner).fill('Sven title')
  await guest.evaluate(
    async ({ id, title }) => {
      const response = await fetch(`/api/spots/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!response.ok) throw new Error(await response.text())
    },
    { id: spotId, title: 'Aiko title' },
  )
  await expect(owner.getByTestId('live-banner')).toContainText('Aiko')
  await owner.getByRole('button', { name: 'Save' }).click()
  await expect(owner.getByTestId('conflict-dialog')).toContainText('Aiko')
  await expect(owner.getByTestId('conflict-dialog')).toContainText('Sven title')
  await expect(owner.getByTestId('conflict-dialog')).toContainText('Aiko title')
  await owner.getByTestId('conflict-mine').click()
  await expect(owner.getByTestId('conflict-dialog')).toHaveCount(0)
  await expect(owner.getByTestId(`card-${spotId}`)).toContainText('Sven title')
  await close()
})

test('T-19-11 deleting an open spot closes it with a toast', async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000)
  const { owner, guest, tripId, close } = await pair(browser, page)
  const spotId = await createSpot(owner, tripId, 'Doomed spot', 35.68, 139.76)
  await owner.goto(`/trips/${tripId}`)
  await owner.getByTestId(`card-${spotId}`).click()
  await expect(owner.getByRole('dialog', { name: 'Edit spot' })).toBeVisible()
  const removed = await guest.evaluate(async (id) => {
    const response = await fetch(`/api/spots/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    return response.status
  }, spotId)
  expect(removed).toBe(204)
  await expect(owner.getByRole('dialog', { name: 'Edit spot' })).toHaveCount(0)
  await expect(owner.getByTestId('toast')).toHaveText('Deleted by Aiko')
  await close()
})

test('T-19-12 a blocked event stream still picks up changes by polling', async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000)
  const { owner, guest, tripId, close } = await pair(browser, page)
  let failures = 0
  await owner.route(`**/api/trips/${tripId}/events*`, async (route) => {
    failures += 1
    await route.abort()
  })
  await owner.goto(`/trips/${tripId}`)
  await expect(owner.getByText('No spots yet')).toBeVisible()
  await expect
    .poll(() => failures, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(3)
  const title = `Polled ${Date.now()}`
  const spotId = await createSpot(guest, tripId, title, 35.68, 139.76)
  await expect(owner.getByTestId(`card-${spotId}`)).toBeVisible({
    timeout: 20_000,
  })
  await close()
})

async function pair(
  browser: {
    newContext: () => Promise<{
      newPage: () => Promise<Page>
      close: () => Promise<void>
    }>
  },
  page: Page,
) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await setLocale(page, 'en')
  const tripId = await createTrip(page, `Live ${Date.now()}`)
  const context = await browser.newContext()
  const guest = await context.newPage()
  await guest.setViewportSize({ width: 1280, height: 800 })
  await login(guest, aiko)
  await setLocale(guest, 'en')
  await share(page, guest, tripId)
  return {
    owner: page,
    guest,
    tripId,
    close: () => context.close(),
  }
}

async function share(owner: Page, guest: Page, tripId: string) {
  const code = await owner.evaluate(async (id) => {
    const response = await fetch(`/api/trips/${id}/invites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'planner' }),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = (await response.json()) as { code: string }
    return body.code
  }, tripId)
  await guest.evaluate(async (invite) => {
    const response = await fetch(`/api/join/${encodeURIComponent(invite)}`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) throw new Error(await response.text())
  }, code)
}

function titleField(page: Page) {
  return page.getByRole('textbox', { name: 'Title', exact: true })
}

function visitTitles(page: Page) {
  return page.locator('[data-testid^="visit-title-"]').allTextContents()
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

async function createSpot(
  page: Page,
  tripId: string,
  title: string,
  lat: number,
  lng: number,
) {
  return page.evaluate(
    async ({ tripId: id, title: spotTitle, lat: spotLat, lng: spotLng }) => {
      const response = await fetch(`/api/trips/${id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: spotTitle,
          lat: spotLat,
          lng: spotLng,
          baseCategory: 'maybe',
          address: 'Tokyo',
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { id: string }
      return body.id
    },
    { tripId, title, lat, lng },
  )
}

async function createBucket(
  page: Page,
  tripId: string,
  title: string,
  startDate: string,
  endDate: string,
) {
  return page.evaluate(
    async ({
      tripId: id,
      title: entryTitle,
      startDate: start,
      endDate: end,
    }) => {
      const response = await fetch(`/api/trips/${id}/plan`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'bucket',
          title: entryTitle,
          startDate: start,
          endDate: end,
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { id: string }
      return body.id
    },
    { tripId, title, startDate, endDate },
  )
}

async function addVisit(
  page: Page,
  entryId: string,
  spotId: string,
  visitDate: string,
) {
  return page.evaluate(
    async ({ entryId: id, spotId: spot, visitDate: date }) => {
      const response = await fetch(`/api/plan/${id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spotId: spot, visitDate: date }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { id: string }
      return body.id
    },
    { entryId, spotId, visitDate },
  )
}

async function mapView(page: Page) {
  return page.evaluate(() => {
    const map = (
      window as unknown as {
        __tripboardMap?: {
          getCenter: () => { lng: number; lat: number }
          getZoom: () => number
        }
      }
    ).__tripboardMap
    if (!map) return { lng: 0, lat: 0, zoom: 0 }
    const center = map.getCenter()
    return { lng: center.lng, lat: center.lat, zoom: map.getZoom() }
  })
}

async function waitForMap(page: Page) {
  await page.waitForFunction(() => {
    const map = (
      window as unknown as {
        __tripboardMap?: { loaded: () => boolean }
      }
    ).__tripboardMap
    return Boolean(map?.loaded())
  })
}
