import { expect, test, type Page } from '@playwright/test'

const sven = '100000000000000001'

// Serial: T-17-14 changes the global capacity setting and restores it in finally.
// Nothing that runs beside it should read that setting.
test.describe.configure({ mode: 'serial' })

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
