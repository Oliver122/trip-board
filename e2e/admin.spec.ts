import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const sven = '100000000000000001'
const aiko = '100000000000000002'
const aikoId = '00000000-0000-0000-0000-000000000002'

test.describe.configure({ mode: 'serial' })

test('T-16-13 an admin extends storage and the audit log records it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await page.goto('/admin/users')
  await page.getByRole('link', { name: 'Aiko' }).click()
  await expect(page.getByRole('heading', { name: 'Aiko' })).toBeVisible()
  await page.getByRole('button', { name: 'Extend storage' }).click()
  const dialog = page.getByRole('dialog', { name: 'Extend storage' })
  await dialog.getByRole('spinbutton', { name: 'Storage (MB)' }).fill('1024')
  await dialog.getByRole('textbox', { name: 'Reason' }).fill('temple photos')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('storage-limit')).toHaveText('Limit: override')
  await expect(page.getByTestId('storage-bytes')).toContainText('1024 MB')
  await page.getByRole('link', { name: 'Audit log' }).click()
  await expect(
    page.getByRole('cell', { name: 'temple photos' }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('cell', { name: 'user.quota_update' }).first(),
  ).toBeVisible()
})

test('T-16-14 a user requests storage and an admin approves it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await page.evaluate(async (userId) => {
    const headers = { 'content-type': 'application/json' }
    const reset = await fetch(`/api/admin/users/${userId}/quota`, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify({ reset: true }),
    })
    if (!reset.ok) throw new Error(await reset.text())
    const settings = await fetch('/api/admin/settings', {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify({ defaultMaxBytes: 200 * 1024 * 1024 }),
    })
    if (!settings.ok) throw new Error(await settings.text())
    const pending = await fetch('/api/admin/quota-requests?status=pending', {
      credentials: 'include',
    })
    const body = (await pending.json()) as { requests: { id: string }[] }
    for (const request of body.requests) {
      const rejected = await fetch(
        `/api/admin/quota-requests/${request.id}/reject`,
        {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ note: 'reset' }),
        },
      )
      if (!rejected.ok) throw new Error(await rejected.text())
    }
  }, aikoId)
  await login(page, aiko)
  await page.goto('/account')
  await page.getByRole('button', { name: 'Request more storage' }).click()
  const dialog = page.getByRole('dialog', { name: 'Request more storage' })
  await dialog
    .getByRole('spinbutton', { name: 'Extra storage (MB)' })
    .fill('500')
  await dialog.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText('Request pending')).toBeVisible()

  await login(page, sven)
  await page.goto('/admin')
  await page.getByRole('link', { name: 'Requests 1' }).click()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible()

  await login(page, aiko)
  await page.goto('/account')
  await expect(page.getByText('Approved: +500 MB')).toBeVisible()
  await expect(page.getByTestId('account-quota')).toContainText('700 MB')
})

test('T-16-15 a normal user cannot see or open the admin area', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, aiko)
  await page.goto('/trips')
  await page.getByRole('button', { name: 'Account menu' }).click()
  await expect(page.getByRole('menuitem', { name: 'Admin' })).toHaveCount(0)
  await page.goto('/admin')
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible()
})

test('T-16-16 admin pages pass axe in both languages', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
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
    await expectNoSeriousViolations(page)
    const headers = page.locator('table th')
    if ((await headers.count()) > 0) {
      await expect(headers.first()).toBeVisible()
    }
  }
  await page.goto('/admin/users')
  await page.getByRole('link', { name: 'Aiko' }).click()
  await expectNoSeriousViolations(page)
  await page.goto('/admin/trips/10000000-0000-0000-0000-000000000001')
  await expect(page.getByRole('heading', { name: 'Japan 2026' })).toBeVisible()
  await expectNoSeriousViolations(page)
  await page.getByRole('button', { name: 'DE' }).click()
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Nutzer' })).toBeVisible()
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
