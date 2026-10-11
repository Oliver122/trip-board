import { expectNoSeriousViolations } from './a11y'
import { expect, test, type Page } from './fixtures'
import { waitForMap } from './map'

type Kind = { id: string; name: string | null; preset: string | null }
type SpotRow = {
  id: string
  title: string
  baseCategory: string
  kinds: { id: string }[]
}

const customNames = ['Alpha', 'Bravo', 'Cedar', 'Delta', 'Ember', 'Fjord']

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

/** A fresh owner with a trip of 10 kinds: the 4 starters and 6 named ones. */
async function setup(page: Page) {
  await login(page, `9${Date.now()}${Math.floor(Math.random() * 1e4)}`)
  await api(page, 'PATCH', '/api/me', { locale: 'en' })
  const trip = await api<{ id: string }>(page, 'POST', '/api/trips', {
    name: `Chips ${Date.now()}`,
    timezone: 'Asia/Tokyo',
    region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
  })
  for (const name of customNames) {
    await api(page, 'POST', `/api/trips/${trip.id}/kinds`, {
      name,
      color: '#D9480F',
    })
  }
  const { kinds } = await api<{ kinds: Kind[] }>(
    page,
    'GET',
    `/api/trips/${trip.id}/kinds`,
  )
  return { tripId: trip.id, kinds }
}

function kindId(kinds: Kind[], name: string): string {
  const found = kinds.find((kind) => kind.name === name || kind.preset === name)
  if (!found) throw new Error(`no kind ${name}`)
  return found.id
}

async function gotoBoard(page: Page, tripId: string) {
  const kindsLoaded = page.waitForResponse(
    (response) =>
      /\/api\/trips\/[^/]+\/kinds$/.test(new URL(response.url()).pathname) &&
      response.ok(),
  )
  await page.goto(`/trips/${tripId}`)
  await kindsLoaded
  await waitForMap(page)
}

test('T-29-13 the filter popover uses chips with counts, search, All and Clear, and a collapsed toolbar chip', async ({
  page,
}) => {
  const { tripId, kinds } = await setup(page)
  expect(kinds).toHaveLength(10)
  const food = kindId(kinds, 'food')
  const alpha = kindId(kinds, 'Alpha')
  const hotel = await createSpot(page, tripId, 'Hotel', 35.1, 'home')
  const ramen = await createSpot(page, tripId, 'Ramen', 35.2, [food])
  const tower = await createSpot(page, tripId, 'Tower', 35.3, [alpha])
  const both = await createSpot(page, tripId, 'Sushi', 35.4, [food, alpha])

  await gotoBoard(page, tripId)
  await expect(page.getByTestId(`card-${hotel}`)).toBeVisible()
  await page.getByRole('button', { name: 'Filter' }).click()
  const popover = page.getByRole('region', { name: 'Filter' })
  await expect(popover.getByRole('checkbox', { name: 'Food' })).toHaveCount(0)
  await expect(popover.getByRole('searchbox')).toBeVisible()
  // Kinds in kind order, then Planned and Home, each with its spot count.
  await expect(popover.getByTestId(`chip-${food}`)).toContainText('2')
  await expect(popover.getByTestId(`chip-${alpha}`)).toContainText('2')
  await expect(popover.getByTestId('chip-home')).toContainText('1')
  await expect(popover.getByTestId('chip-planned')).toContainText('0')

  await popover.getByRole('searchbox').fill('alp')
  await expect(popover.getByTestId(`chip-${alpha}`)).toBeVisible()
  await expect(popover.getByTestId(`chip-${food}`)).toHaveCount(0)
  await popover.getByRole('searchbox').fill('zzz')
  await expect(popover.getByText('No matches')).toBeVisible()
  await popover.getByRole('searchbox').fill('')

  // The URL and the results match the step 28 filter.
  await popover.getByTestId(`chip-${food}`).click()
  await expect(popover.getByTestId(`chip-${food}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page).toHaveURL(new RegExp(`cat=${food}`), { timeout: 15_000 })
  await expect(page.getByTestId(`card-${ramen}`)).toBeVisible()
  await expect(page.getByTestId(`card-${both}`)).toBeVisible()
  for (const id of [hotel, tower]) {
    await expect(page.getByTestId(`card-${id}`)).toHaveCount(0)
  }

  await popover.getByRole('button', { name: 'All', exact: true }).click()
  await expect(popover.getByTestId(`chip-${alpha}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(popover.getByTestId('chip-home')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await popover.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(popover.getByTestId(`chip-${alpha}`)).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page).not.toHaveURL(/cat=/)
  for (const id of [hotel, ramen, tower, both]) {
    await expect(page.getByTestId(`card-${id}`)).toBeVisible()
  }

  // Four categories collapse into "<first> +3"; the names show on focus.
  for (const name of ['must_go', 'maybe', 'food', 'sights']) {
    await popover.getByTestId(`chip-${kindId(kinds, name)}`).click()
  }
  const toolbarChips = page.getByRole('list', { name: 'Active filters' })
  const collapsed = toolbarChips.getByRole('button')
  await expect(collapsed).toHaveCount(1)
  await expect(collapsed).toContainText(/\+3$/)
  await collapsed.focus()
  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toBeVisible()
  for (const name of ['Must go', 'Maybe', 'Food', 'Sights']) {
    await expect(tooltip).toContainText(name)
  }
  await expect(page).toHaveURL(new RegExp(`cat=${kindId(kinds, 'must_go')}`))
})

test('T-29-14 the spot panel picks kinds with chips, Home clears them, and the import preview uses the same chips', async ({
  page,
}) => {
  const { tripId, kinds } = await setup(page)
  const mustGo = kindId(kinds, 'must_go')
  const maybe = kindId(kinds, 'maybe')
  const food = kindId(kinds, 'food')
  const spotId = await createSpot(page, tripId, 'Gate', 35.3, [mustGo])

  await gotoBoard(page, tripId)
  await page.getByTestId(`card-${spotId}`).click()
  const panel = page.getByTestId('kind-picker')
  await expect(panel.getByRole('checkbox')).toHaveCount(0)
  await expect(panel.getByTestId(`chip-${mustGo}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await panel.getByTestId(`chip-${maybe}`).click()
  await expect(panel.getByTestId(`chip-${maybe}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('At most 2 kinds')).toBeVisible()
  await expect(panel.getByTestId(`chip-${food}`)).toBeDisabled()

  await panel.getByTestId('chip-home').click()
  await expect(panel.getByTestId('chip-home')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(panel.getByTestId(`chip-${mustGo}`)).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(panel.getByTestId(`chip-${maybe}`)).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(panel.getByTestId(`chip-${food}`)).toBeEnabled()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect
    .poll(async () => {
      const { spots } = await api<{ spots: SpotRow[] }>(
        page,
        'GET',
        `/api/trips/${tripId}/spots`,
      )
      return spots.find((spot) => spot.id === spotId)?.baseCategory
    })
    .toBe('home')

  // The import preview picks kinds with the same chips.
  await page.getByRole('button', { name: 'Import' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import spots' })
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'kyoto.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Title,URL\r\nWith URL,"https://maps.google.com/@35.0,135.5,15z"',
      'utf8',
    ),
  })
  await expect(dialog.getByRole('group', { name: 'Category' })).toHaveCount(1)
  await expect(dialog.getByTestId(`chip-${mustGo}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await dialog.getByTestId(`chip-${food}`).click()
  await expect(dialog.getByTestId(`chip-${maybe}`)).toBeDisabled()
  await dialog.getByRole('button', { name: /^Import 1/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect
    .poll(async () => {
      const { spots } = await api<{ spots: SpotRow[] }>(
        page,
        'GET',
        `/api/trips/${tripId}/spots`,
      )
      return spots
        .find((spot) => spot.title === 'With URL')
        ?.kinds.map((kind) => kind.id)
        .sort()
    })
    .toEqual([mustGo, food].sort())
})

test('T-29-23 the filter popover passes axe in light and dark mode', async ({
  page,
}) => {
  const { tripId } = await setup(page)
  await gotoBoard(page, tripId)
  await page.getByRole('button', { name: 'Filter' }).click()
  const popover = page.getByRole('region', { name: 'Filter' })
  await popover.getByRole('button', { name: 'All', exact: true }).click()
  await expectNoSeriousViolations(page, {
    include: '[aria-label="Filter"][role="region"]',
    label: 'light',
  })
  // The theme switch is outside the toolbar, so it closes the popover.
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.getByRole('button', { name: 'Filter' }).click()
  await popover.getByRole('button', { name: 'All', exact: true }).click()
  await expectNoSeriousViolations(page, {
    include: '[aria-label="Filter"][role="region"]',
    label: 'dark',
  })
})

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
