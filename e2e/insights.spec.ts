import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const sven = '100000000000000001'
const aiko = '100000000000000002'
const japan = '10000000-0000-0000-0000-000000000001'

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
  const planner = await browser.newContext()
  const other = await planner.newPage()
  await login(other, aiko)
  const created = await other.evaluate(
    async ({ tripId, spotTitle }) => {
      const response = await fetch(`/api/trips/${tripId}/spots`, {
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
    { tripId: japan, spotTitle: title },
  )
  expect(created).toBe(201)
  await expect(page.getByRole('button', { name: /\d+ new/ })).toBeVisible({
    timeout: 20_000,
  })
  await page.getByRole('button', { name: /\d+ new/ }).click()
  await expect(
    page.getByText(`Aiko added ${title} to Japan 2026`),
  ).toBeVisible()
  await planner.close()
})

test('T-17-14 a low capacity shows the warning on every admin page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await page.goto('/admin/settings')
  const database = page.getByRole('spinbutton', { name: 'Database (MB)' })
  const previous = await database.inputValue()
  try {
    await database.fill('1')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(
      page.getByText('Saved. The new values apply now.'),
    ).toBeVisible()
    const paths = [
      '/admin',
      '/admin/users',
      '/admin/trips',
      '/admin/activity',
      '/admin/storage',
      '/admin/requests',
      '/admin/settings',
      '/admin/audit',
    ]
    for (const path of paths) {
      await page.goto(path)
      await expect(page.getByTestId('capacity-banner')).toBeVisible()
    }
  } finally {
    await page.goto('/admin/settings')
    await page.getByRole('spinbutton', { name: 'Database (MB)' }).fill(previous)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(
      page.getByText('Saved. The new values apply now.'),
    ).toBeVisible()
  }
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

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious).toEqual([])
}
