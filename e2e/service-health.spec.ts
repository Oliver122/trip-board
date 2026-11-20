import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y'

const sven = '100000000000000001'

test('T-45-10 the service health panel shows jobs and runs one', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await page.goto('/admin')
  const panel = page.getByTestId('service-health')
  await expect(panel).toBeVisible()
  await expect(
    panel.getByRole('heading', { name: 'Service health' }),
  ).toBeVisible()
  await expect(page.getByTestId('ops-started')).toContainText('Up since')

  const invites = page.getByTestId('job-invites')
  await expect(invites).toHaveAttribute('data-overdue', 'true')
  await expect(invites).toContainText('Overdue')
  await expect(page.getByTestId('job-geocode')).toContainText('Not yet run')

  const ops = page.getByTestId('chart-ops')
  await ops.getByRole('button', { name: 'Show as table' }).click()
  await expect(ops.getByRole('table')).toBeVisible()

  const sessions = page.getByTestId('job-sessions')
  await sessions.getByRole('button', { name: 'Run now' }).click()
  await expect(sessions).toHaveAttribute('data-result', 'ok')
  await expect(sessions).toContainText(/now|seconds? ago|minute/i)
})

test('T-45-10 the dashboard with the panel passes axe and is captured', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await page.goto('/admin')
  const panel = page.getByTestId('service-health')
  await expect(panel).toBeVisible()
  await expect(page.getByTestId('job-invites')).toBeVisible()
  await expectNoSeriousViolations(page)
  await panel.scrollIntoViewIfNeeded()
  await shot(page, 'service-health-1280')
  await page.setViewportSize({ width: 768, height: 900 })
  await expect(panel).toBeVisible()
  await panel.scrollIntoViewIfNeeded()
  await shot(page, 'service-health-768')
})

async function shot(page: Page, name: string) {
  const image = await page.screenshot()
  await test.info().attach(name, { body: image, contentType: 'image/png' })
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
    await fetch('/api/me', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'en' }),
    })
  }, discordId)
}
