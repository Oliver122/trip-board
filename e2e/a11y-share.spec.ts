import { expectNoSeriousViolations } from './a11y'
import { expect, test, type Page } from './fixtures'

// T-33-10: /share and the account page section, in both themes.
for (const theme of ['light', 'dark'] as const) {
  test(`T-33-10 /share and the account section have no serious issues (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.addInitScript((value) => {
      try {
        localStorage.setItem('theme', value)
      } catch {
        // storage blocked
      }
    }, theme)
    await login(page, '100000000000000002')
    await setLocale(page, 'en')

    await page.goto(
      '/share?url=' + encodeURIComponent('https://maps.app.goo.gl/abc'),
    )
    await expect(page.getByRole('radio').first()).toBeVisible()
    await expect(page.locator('html')).toHaveClass(
      theme === 'dark' ? /dark/ : /^(?!.*dark).*$/,
    )
    await expectNoSeriousViolations(page, `share ${theme}`)

    await page.goto('/account')
    const section = page.getByRole('region', {
      name: 'Send places from Google Maps',
    })
    await expect(section).toBeVisible()
    await expectNoSeriousViolations(page, {
      include: '[data-testid="google-maps-section"]',
      label: `account ${theme}`,
    })
  })
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
