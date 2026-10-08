import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y'

const sven = '100000000000000001'
const aiko = '100000000000000002'

test('T-17-12 the dashboard charts follow the selected range', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await page.goto('/admin')
  await expect(page.getByTestId('chart-active')).toBeVisible()
  for (const id of [
    'chart-active',
    'chart-activity',
    'chart-storage',
    'chart-signups',
    'chart-users',
    'chart-trips',
  ]) {
    await expect(page.getByTestId(id)).toBeVisible()
  }
  const wide = Number(
    await page.getByTestId('chart-active').getAttribute('data-points'),
  )
  const events = await page.getByTestId('kpi-events').innerText()
  await page.getByRole('button', { name: '7 days' }).click()
  await expect(page.getByTestId('chart-active')).not.toHaveAttribute(
    'data-points',
    String(wide),
  )
  const narrow = Number(
    await page.getByTestId('chart-active').getAttribute('data-points'),
  )
  expect(narrow).toBeGreaterThan(0)
  expect(narrow).toBeLessThan(wide)
  await expect(page.getByTestId('kpi-events')).not.toHaveText(events)
  await page.setViewportSize({ width: 768, height: 900 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('T-17-13 the feed holds new activity until it is opened', async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await page.goto('/admin/activity')
  await expect(page.getByText('Live, updates every 15 seconds')).toBeVisible()
  const title = `Temple Gate ${Date.now()}`
  const tripName = `Feed ${Date.now()}`
  const planner = await browser.newContext()
  const other = await planner.newPage()
  await login(other, aiko)
  const created = await other.evaluate(
    async ({ spotTitle, name }) => {
      const trip = await fetch('/api/trips', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          timezone: 'Asia/Tokyo',
          region: {
            bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 },
          },
        }),
      })
      if (!trip.ok) throw new Error(await trip.text())
      const body = (await trip.json()) as { id: string }
      const response = await fetch(`/api/trips/${body.id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: spotTitle,
          lat: 35.68,
          lng: 139.76,
          baseCategory: 'must_go',
        }),
      })
      return response.status
    },
    { spotTitle: title, name: tripName },
  )
  expect(created).toBe(201)
  await expect(page.getByRole('button', { name: /\d+ new/ })).toBeVisible({
    timeout: 20_000,
  })
  await page.getByRole('button', { name: /\d+ new/ }).click()
  await expect(
    page.getByText(`Aiko added ${title} to ${tripName}`),
  ).toBeVisible()
  await planner.close()
})

test('T-17-15 dashboard and storage pass axe and charts have a table', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await page.goto('/admin')
  await expect(page.getByTestId('chart-active')).toBeVisible()
  const toggles = page.getByRole('button', { name: 'Show as table' })
  await expect(toggles).toHaveCount(6)
  await toggles.first().click()
  await expect(
    page.getByTestId('chart-active').getByRole('table'),
  ).toBeVisible()
  await expectNoSeriousViolations(page)
  await page.getByRole('button', { name: 'Dark' }).click()
  await expectNoSeriousViolations(page)
  await page.goto('/admin/storage')
  await expect(page.getByRole('heading', { name: 'Storage' })).toBeVisible()
  await expectNoSeriousViolations(page)
  try {
    await page.evaluate(async () => {
      const response = await fetch('/api/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: 'de' }),
      })
      if (!response.ok) throw new Error(await response.text())
    })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Speicher' })).toBeVisible()
    await expectNoSeriousViolations(page)
  } finally {
    await page.evaluate(async () => {
      await fetch('/api/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: 'en' }),
      })
    })
  }
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
    await fetch('/api/me', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'en' }),
    })
  }, discordId)
}
