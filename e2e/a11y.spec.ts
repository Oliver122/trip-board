import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'

test('T-15-09 axe finds no serious issues on the main pages in both themes', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/login')
  await expectNoSeriousViolations(page, 'light')
  await page.getByRole('button', { name: 'Dark' }).click()
  await expectNoSeriousViolations(page, 'dark')

  await login(page, '100000000000000001')
  await page.getByRole('button', { name: 'Light' }).click()

  await page.goto('/trips')
  await expectNoSeriousViolations(page, 'light')
  await page.getByRole('button', { name: 'Dark' }).click()
  await expectNoSeriousViolations(page, 'dark')
  await page.getByRole('button', { name: 'Light' }).click()

  await page.goto(japanTrip)
  await expect(
    page.getByRole('heading', { name: 'Things to do' }),
  ).toBeVisible()
  await expectNoSeriousViolations(page, 'light')
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Shibuya Sky/ })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoSeriousViolations(page, 'light')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Dark' }).click()
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Shibuya Sky/ })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoSeriousViolations(page, 'dark')
  await page.keyboard.press('Escape')

  await page.goto(`${japanTrip}/schedule`)
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible()
  await expectNoSeriousViolations(page, 'dark')
  await page.getByRole('button', { name: 'Light' }).click()
  await expectNoSeriousViolations(page, 'light')

  await page.goto(japanTrip)
  await page.getByRole('button', { name: 'Members' }).click()
  await expect(page.getByRole('dialog', { name: 'Members' })).toBeVisible()
  await expectNoSeriousViolations(page, 'light')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.getByRole('button', { name: 'Members' }).click()
  await expect(page.getByRole('dialog', { name: 'Members' })).toBeVisible()
  await expectNoSeriousViolations(page, 'dark')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Light' }).click()
  await page.getByRole('button', { name: 'Export' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoSeriousViolations(page, 'light')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.getByRole('button', { name: 'Export' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoSeriousViolations(page, 'dark')
  await page.keyboard.press('Escape')

  const code = await page.evaluate(async () => {
    const response = await fetch(
      '/api/trips/10000000-0000-0000-0000-000000000001/invites',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'visitor' }),
      },
    )
    if (!response.ok) throw new Error(await response.text())
    const body = (await response.json()) as { code: string }
    return body.code
  })
  await page.goto(`/join/${code}`)
  await expect(page.getByRole('button', { name: 'Join trip' })).toBeVisible()
  await expectNoSeriousViolations(page, 'dark')
  await page.getByRole('button', { name: 'Light' }).click()
  await expectNoSeriousViolations(page, 'light')

  await page.goto('/account')
  await expect(
    page.getByRole('heading', { name: 'Account & settings' }),
  ).toBeVisible()
  await expectNoSeriousViolations(page, 'light')
  await page.getByRole('banner').getByRole('button', { name: 'Dark' }).click()
  await expectNoSeriousViolations(page, 'dark')
})

async function expectNoSeriousViolations(page: Page, theme: string) {
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious, theme).toEqual([])
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
