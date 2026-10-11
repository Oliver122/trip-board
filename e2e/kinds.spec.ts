import { expect, test, type Page } from './fixtures'
import { waitForMap } from './map'

type Kind = { id: string; name: string | null; preset: string | null }

const orange = 'rgb(217, 72, 15)'
const red = 'rgb(229, 72, 77)'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

/** A fresh owner with a trip whose kinds are Top (was Must go), Food, Maybe. */
async function setup(page: Page) {
  await login(page, freshDiscordId())
  await setLocale(page, 'en')
  const tripId = await api<{ id: string }>(page, 'POST', '/api/trips', {
    name: `Kinds ${Date.now()}`,
    timezone: 'Asia/Tokyo',
    region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
  }).then((trip) => trip.id)
  const { kinds } = await api<{ kinds: Kind[] }>(
    page,
    'GET',
    `/api/trips/${tripId}/kinds`,
  )
  const mustGo = kinds.find((kind) => kind.preset === 'must_go')
  const maybe = kinds.find((kind) => kind.preset === 'maybe')
  if (!mustGo || !maybe) throw new Error('preset kinds are missing')
  await api(page, 'PATCH', `/api/trips/${tripId}/kinds/${mustGo.id}`, {
    name: 'Top',
  })
  const food = await api<{ id: string }>(
    page,
    'POST',
    `/api/trips/${tripId}/kinds`,
    { name: 'Food', color: '#D9480F', symbol: 'food' },
  )
  await api(page, 'PUT', `/api/trips/${tripId}/kinds/order`, {
    ids: [mustGo.id, food.id, maybe.id],
  })
  return { tripId, top: mustGo.id, food: food.id, maybe: maybe.id }
}

test('T-28-16 filter by a kind, an old must_go link, and Category sort', async ({
  page,
}) => {
  const trip = await setup(page)
  const spot = (title: string, lat: number, kindIds: string[] | 'home') =>
    createSpot(page, trip.tripId, title, lat, kindIds)
  const hotel = await spot('Hotel', 35.1, 'home')
  const ichiran = await spot('Ichiran', 35.2, [trip.food])
  const gate = await spot('Gate', 35.3, [trip.top])
  const cafe = await spot('Cafe', 35.4, [trip.maybe])
  const both = await spot('Sushi', 35.5, [trip.food, trip.maybe])

  await gotoBoard(page, `/trips/${trip.tripId}`)
  await expect(page.getByTestId(`card-${hotel}`)).toBeVisible()
  await page.getByRole('button', { name: 'Filter' }).click()
  await page.getByRole('checkbox', { name: 'Food' }).check()
  await expect(page).toHaveURL(new RegExp(`cat=${trip.food}`), {
    timeout: 15_000,
  })
  await expect(page.getByTestId(`card-${ichiran}`)).toBeVisible()
  await expect(page.getByTestId(`card-${both}`)).toBeVisible()
  for (const id of [hotel, gate, cafe]) {
    await expect(page.getByTestId(`card-${id}`)).toHaveCount(0)
  }

  // An old link maps to the preset kind and is rewritten.
  await gotoBoard(page, `/trips/${trip.tripId}?cat=must_go`)
  await expect(page).toHaveURL(new RegExp(`cat=${trip.top}`), {
    timeout: 15_000,
  })
  await expect(page.getByTestId(`card-${gate}`)).toBeVisible()
  for (const id of [hotel, ichiran, cafe, both]) {
    await expect(page.getByTestId(`card-${id}`)).toHaveCount(0)
  }

  // Category sort: primary kind order (Top, Food, Maybe), then Home.
  await gotoBoard(page, `/trips/${trip.tripId}?sort=category`)
  await expect(page.getByTestId(`card-${hotel}`)).toBeVisible()
  const order = await page
    .locator('[data-testid^="card-"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-testid')?.slice(5)),
    )
  expect(order[0]).toBe(gate)
  expect(order.slice(1, 3).sort()).toEqual([ichiran, both].sort())
  expect(order.slice(3)).toEqual([cafe, hotel])

  // After the preset kind is deleted the old link opens unfiltered.
  await api(
    page,
    'DELETE',
    `/api/trips/${trip.tripId}/kinds/${trip.top}?moveTo=${trip.maybe}`,
  )
  await gotoBoard(page, `/trips/${trip.tripId}?cat=must_go`)
  for (const id of [hotel, ichiran, gate, cafe, both]) {
    await expect(page.getByTestId(`card-${id}`)).toBeVisible()
  }
  await expect(page).not.toHaveURL(/cat=/)
  await expect(page.getByTestId('toast')).toHaveCount(0)
})

test('T-28-18 importing with Food and Maybe gives every spot both kinds', async ({
  page,
}) => {
  const trip = await setup(page)
  await page.goto(`/trips/${trip.tripId}`)
  await waitForMap(page)
  await page.getByRole('button', { name: 'Import' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import spots' })
  const csv = [
    'Title,URL',
    'With URL,"https://maps.google.com/@35.0,135.5,15z"',
    'Second URL,"https://maps.google.com/@35.1,135.6,15z"',
  ].join('\r\n')
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'kyoto.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  })
  // The default is the first kind; add Food, then drop Top, then add Maybe.
  await expect(dialog.getByRole('checkbox', { name: 'Top' })).toBeChecked()
  await dialog.getByRole('checkbox', { name: 'Food' }).check()
  await dialog.getByRole('checkbox', { name: 'Top' }).uncheck()
  await dialog.getByRole('checkbox', { name: 'Maybe' }).check()
  await expect(dialog.getByRole('checkbox', { name: 'Top' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Import 2 spots' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const { spots } = await api<{
    spots: { title: string; kinds: { id: string }[] }[]
  }>(page, 'GET', `/api/trips/${trip.tripId}/spots`)
  expect(spots).toHaveLength(2)
  for (const spot of spots) {
    expect(spot.kinds.map((kind) => kind.id)).toEqual([trip.food, trip.maybe])
  }
})

test('T-28-27 a spot with Food and Top shows split pin, split strip and both names', async ({
  page,
}) => {
  const trip = await setup(page)
  const id = await createSpot(page, trip.tripId, 'Ichiran Ramen', 35.69, [
    trip.food,
    trip.top,
  ])
  await page.goto(`/trips/${trip.tripId}`)
  await waitForMap(page)

  const pin = page.getByTestId(`pin-${id}`)
  await expect(pin).toBeVisible()
  await expect(pin).toHaveAccessibleName('Ichiran Ramen, Top and Food')
  await expect(pin.locator('[data-half="left"]')).toHaveCSS(
    'background-color',
    red,
  )
  await expect(pin.locator('[data-half="right"]')).toHaveCSS(
    'background-color',
    orange,
  )
  await expect(pin.locator('[data-icon="exclamation"]')).toBeVisible()
  await expect(pin.locator('[data-icon="food"]')).toHaveCount(0)

  const card = page.getByTestId(`card-${id}`)
  await expect(
    card.locator('[data-testid="category-strip"] [data-half="top"]'),
  ).toHaveCSS('background-color', red)
  await expect(
    card.locator('[data-testid="category-strip"] [data-half="bottom"]'),
  ).toHaveCSS('background-color', orange)

  await card.click()
  const badge = page.getByRole('dialog').getByTestId('category-badge')
  await expect(badge).toContainText('Top')
  await expect(badge).toContainText('Food')
  await page.getByRole('button', { name: 'Close' }).click()

  // A plan entry turns the pin into the Planned pin.
  const entry = await api<{ id: string }>(
    page,
    'POST',
    `/api/trips/${trip.tripId}/plan`,
    {
      type: 'bucket',
      title: 'Tokyo',
      startDate: '2026-04-10',
      endDate: '2026-04-12',
    },
  )
  await api(page, 'POST', `/api/plan/${entry.id}/spots`, {
    spotId: id,
    visitDate: '2026-04-11',
    visitTime: '12:00',
  })
  await expect(pin.locator('[data-icon="planned"]')).toBeVisible()
  await expect(pin.locator('[data-half]')).toHaveCount(0)
})

test('T-28-13 the spot panel lists the kinds in order, saves one, and limits to two', async ({
  page,
}) => {
  const trip = await setup(page)
  const id = await createSpot(page, trip.tripId, 'Ichiran Ramen', 35.69, [
    trip.maybe,
  ])
  await page.goto(`/trips/${trip.tripId}`)
  await waitForMap(page)
  await page.getByTestId(`card-${id}`).click()

  const dialog = page.getByRole('dialog')
  const picker = dialog.getByTestId('kind-picker')
  await expect(picker.getByRole('checkbox')).toHaveCount(4)
  await expect(picker.locator('label')).toHaveText([
    'Top',
    'Food',
    'Maybe',
    'Home',
  ])

  // Move from Maybe to Food only.
  await picker.getByRole('checkbox', { name: 'Food' }).check()
  await picker.getByRole('checkbox', { name: 'Maybe' }).uncheck()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const pin = page.getByTestId(`pin-${id}`)
  await expect(pin).toHaveCSS('background-color', orange)
  await expect(pin.locator('[data-icon="food"]')).toBeVisible()
  await expect(
    page.getByTestId(`card-${id}`).getByTestId('category-strip'),
  ).toHaveCSS('background-color', orange)

  // Food and Top picked: the rest is disabled with a hint.
  await page.getByTestId(`card-${id}`).click()
  await dialog.getByRole('checkbox', { name: 'Top' }).check()
  await expect(dialog.getByRole('checkbox', { name: 'Maybe' })).toBeDisabled()
  await expect(dialog.getByText('At most 2 kinds')).toBeVisible()
})

/** Opens the board and waits for the kinds and the map, so URL rewrites have run. */
async function gotoBoard(page: Page, url: string) {
  const kindsLoaded = page.waitForResponse(
    (response) =>
      /\/api\/trips\/[^/]+\/kinds$/.test(new URL(response.url()).pathname) &&
      response.ok(),
  )
  await page.goto(url)
  await kindsLoaded
  await waitForMap(page)
}

async function api<T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return page.evaluate(
    async ({ method: verb, path: url, body: payload }) => {
      const response = await fetch(url, {
        method: verb,
        credentials: 'include',
        headers:
          payload === undefined ? {} : { 'content-type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      })
      if (!response.ok)
        throw new Error(`${verb} ${url}: ${await response.text()}`)
      if (response.status === 204) return null
      return (await response.json()) as unknown
    },
    { method, path, body },
  ) as Promise<T>
}

async function createSpot(
  page: Page,
  tripId: string,
  title: string,
  lat: number,
  kinds: string[] | 'home',
): Promise<string> {
  const spot = await api<{ id: string }>(
    page,
    'POST',
    `/api/trips/${tripId}/spots`,
    {
      title,
      lat,
      lng: 139.7,
      address: 'Tokyo',
      ...(kinds === 'home' ? { category: 'home' } : { kindIds: kinds }),
    },
  )
  return spot.id
}

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

async function setLocale(page: Page, locale: 'en' | 'de') {
  await api(page, 'PATCH', '/api/me', { locale })
}
