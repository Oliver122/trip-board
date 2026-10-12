import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y'

// T-02-09
test('logged-out trips page returns after test login', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/trips')
  await expect(page).toHaveURL(/\/login\?next=%2Ftrips/)
  await expect(
    page.getByRole('link', { name: 'Continue with Discord' }),
  ).toBeVisible()
  await shot(page, 'login-1280')
  await expectNoSeriousViolations(page)

  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, 'login-768')
  await expectNoSeriousViolations(page)

  const body = await page.evaluate(async () => {
    const response = await fetch('/api/test/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ discordId: '100000000000000099' }),
    })
    if (!response.ok) throw new Error(await response.text())
    return (await response.json()) as { username: string }
  })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/trips')
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()
  await expect(page.getByTestId('username')).toHaveText(body.username)
  await expect(page.getByText('No trips yet.')).toBeVisible()
  await shot(page, 'trips-1280')
  await expectNoSeriousViolations(page)

  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, 'trips-768')
  await expectNoSeriousViolations(page)
})

// T-02-10
test('a cancelled Discord login shows the translated error', async ({
  page,
}) => {
  await page.goto('/api/auth/discord/callback?error=access_denied')
  await expect(page.getByTestId('login-error')).toHaveText('Login cancelled')
})

async function shot(page: Page, name: string) {
  const image = await page.screenshot()
  await test.info().attach(name, { body: image, contentType: 'image/png' })
}
