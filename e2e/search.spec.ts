import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'
const shibuya = '20000000-0000-0000-0000-000000000001'
const fushimi = '20000000-0000-0000-0000-000000000003'
const nara = '20000000-0000-0000-0000-000000000004'
const hotel = '20000000-0000-0000-0000-000000000005'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, '100000000000000001')
  await setLocale(page, 'en')
})

test('T-09-06 filtering to Must go hides other pins and cards', async ({
  page,
}) => {
  await page.goto(japanTrip)
  await waitForMap(page)
  await expect(page.getByTestId(`pin-${fushimi}`)).toBeVisible()
  await expect(page.getByTestId(`card-${nara}`)).toBeVisible()
  await page.getByRole('button', { name: 'Filter' }).click()
  await page.getByRole('checkbox', { name: 'Must go' }).click()
  await expect(page).toHaveURL(/cat=must_go/)
  await expect(page.getByRole('checkbox', { name: 'Must go' })).toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Remove Must go' }),
  ).toBeVisible()
  await expect(page.getByTestId(`pin-${fushimi}`)).toHaveCount(0)
  await expect(page.getByTestId(`card-${fushimi}`)).toHaveCount(0)
  await expect(page.getByTestId(`pin-${nara}`)).toHaveCount(0)
  await expect(page.getByTestId(`card-${nara}`)).toHaveCount(0)
  await expect(page.getByTestId(`pin-${hotel}`)).toHaveCount(0)

  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious).toEqual([])

  await page.getByRole('button', { name: 'Remove Must go' }).click()
  await expect(page.getByTestId(`pin-${fushimi}`)).toBeVisible()
  await expect(page.getByTestId(`card-${fushimi}`)).toBeVisible()
  await expect(page.getByTestId(`card-${nara}`)).toBeVisible()
  await expect(page.getByTestId(`pin-${hotel}`)).toBeVisible()
})

test('T-09-07 a shared filter URL reproduces the chips and results', async ({
  page,
  browser,
}) => {
  await page.goto(japanTrip)
  await page.getByRole('button', { name: 'Filter' }).click()
  await page.getByRole('checkbox', { name: 'Home' }).click()
  await expect(page).toHaveURL(/cat=home/)
  await expect(page.getByTestId(`card-${hotel}`)).toBeVisible()
  await expect(page.getByTestId(`card-${fushimi}`)).toHaveCount(0)
  const url = page.url()

  const context = await browser.newContext()
  const next = await context.newPage()
  await next.setViewportSize({ width: 1280, height: 800 })
  await login(next, '100000000000000001')
  await setLocale(next, 'en')
  await next.goto(url)
  await expect(next.getByRole('button', { name: 'Remove Home' })).toBeVisible()
  await expect(next.getByTestId(`card-${hotel}`)).toBeVisible()
  await expect(next.getByTestId(`card-${fushimi}`)).toHaveCount(0)
  await context.close()
})

test('T-09-08 scheduled spots come first, then the divider', async ({
  page,
}) => {
  await page.goto(japanTrip)
  await expect(page.getByTestId(`card-${shibuya}`)).toBeVisible()
  const order = await page
    .getByTestId('spot-list')
    .locator('[data-testid^="card-"], [data-testid="unscheduled-divider"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-testid')),
    )
  expect(order).toEqual([
    `card-${shibuya}`,
    'card-20000000-0000-0000-0000-000000000002',
    `card-${fushimi}`,
    'unscheduled-divider',
    `card-${nara}`,
    `card-${hotel}`,
    'card-20000000-0000-0000-0000-000000000006',
  ])
  await expect(page.getByText('Not scheduled yet')).toBeVisible()
})

test('T-09-09 an empty search offers Reset back to 6 spots', async ({
  page,
}) => {
  await page.goto(japanTrip)
  await expect(page.getByTestId('spot-count')).toHaveText('6 spots')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page
    .getByRole('searchbox', { name: 'Search' })
    .fill('zzzz-no-such-spot')
  await expect(page.getByText('No spots match your filters')).toBeVisible()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByTestId('spot-count')).toHaveText('6 spots')
  await expect(page.getByTestId(`card-${fushimi}`)).toBeVisible()
})

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

async function waitForMap(page: Page) {
  await page.waitForFunction(
    () => {
      const map = (
        window as unknown as {
          __tripboardMap?: { getCenter: () => { lng: number; lat: number } }
        }
      ).__tripboardMap
      if (!map) return false
      const center = map.getCenter()
      return Number.isFinite(center.lng) && Number.isFinite(center.lat)
    },
    undefined,
    { timeout: 20_000 },
  )
}
