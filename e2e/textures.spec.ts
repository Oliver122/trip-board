import { readFileSync } from 'node:fs'
import { expect, test, type Page } from './fixtures'
import { showLocale } from './locale'
import { waitForMapLoaded } from './map'

const sven = '100000000000000001'
const fixtureDir = new URL('./fixtures/textures/', import.meta.url)
const atlasPng = readFileSync(new URL('kind-symbols-fixture.png', fixtureDir))
const fixtureManifest = readFileSync(
  new URL('texture-manifest.json', fixtureDir),
  'utf8',
)
const atlasPattern = '**/textures/kind-symbols.png*'

async function api<T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return page.evaluate(
    async (input) => {
      const response = await fetch(`/api${input.path}`, {
        method: input.method,
        credentials: 'include',
        headers:
          input.body === undefined
            ? {}
            : { 'content-type': 'application/json' },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      })
      if (!response.ok) {
        throw new Error(`${input.method} ${input.path} ${response.status}`)
      }
      return response.status === 204 ? null : await response.json()
    },
    { method, path, body },
  ) as Promise<T>
}

/** A fresh trip (it starts with Food, symbol `food` = cell 5) with one Food spot. */
async function foodTrip(page: Page): Promise<string> {
  await page.goto('/login')
  await api(page, 'POST', '/test/login', { discordId: sven })
  const trip = await api<{ id: string }>(page, 'POST', '/trips', {
    name: `Textures ${Date.now()}`,
    timezone: 'Asia/Tokyo',
    region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
  })
  const { kinds } = await api<{
    kinds: { id: string; preset: string | null }[]
  }>(page, 'GET', `/trips/${trip.id}/kinds`)
  const food = kinds.find((kind) => kind.preset === 'food')
  if (!food) throw new Error('a new trip should start with Food')
  await api(page, 'POST', `/trips/${trip.id}/spots`, {
    title: 'Ramen Test',
    lat: 35.68,
    lng: 139.76,
    address: 'Tokyo',
    kindIds: [food.id],
  })
  return trip.id
}

async function injectManifest(page: Page) {
  await page.addInitScript((manifest) => {
    localStorage.setItem('tripboard.textureManifest', manifest)
  }, fixtureManifest)
}

async function openBoard(page: Page, tripId: string) {
  await page.goto(`/trips/${tripId}`)
  await waitForMapLoaded(page)
  const pin = page.getByRole('button', { name: 'Ramen Test, Food' })
  await expect(pin).toBeVisible()
  return pin
}

test.beforeEach(async ({ page }) => {
  await showLocale(page, 'en')
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('T-29-21 the default empty manifest requests no atlas and shows the vector symbol', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/textures/kind-symbols.png')) {
      requests.push(request.url())
    }
  })
  const tripId = await foodTrip(page)
  const pin = await openBoard(page, tripId)
  await expect(pin.locator('[data-icon="food"]')).toBeVisible()
  await expect(pin.locator('[data-texture]')).toHaveCount(0)
  expect(requests).toEqual([])
})

test('T-29-21 with the fixture manifest a Food pin shows the texture', async ({
  page,
}) => {
  await page.route(atlasPattern, (route) =>
    route.fulfill({ body: atlasPng, contentType: 'image/png' }),
  )
  await injectManifest(page)
  const tripId = await foodTrip(page)
  const pin = await openBoard(page, tripId)
  const mark = pin.locator('[data-texture="food"]')
  await expect(mark).toBeVisible()
  await expect
    .poll(() =>
      mark.evaluate((element) => getComputedStyle(element).backgroundImage),
    )
    .toContain('/textures/kind-symbols.png?v=')
  await expect(pin.locator('[data-icon="food"]')).toHaveCount(0)
})

test('T-29-22 a blocked atlas falls back to the vector symbol', async ({
  page,
}) => {
  await page.route(atlasPattern, (route) => route.abort())
  await injectManifest(page)
  const tripId = await foodTrip(page)
  const pin = await openBoard(page, tripId)
  await expect(pin.locator('[data-icon="food"]')).toBeVisible()
  await expect(pin.locator('[data-texture]')).toHaveCount(0)
})
