import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('T-03-03 switching to German updates the header and survives reload', async ({
  page,
}) => {
  await login(page, '100000000000000304')
  await setLocale(page, 'en')
  await page.goto('/trips')
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Light' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Account & settings' }).click()

  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/me') &&
      response.request().method() === 'PATCH' &&
      response.ok(),
  )
  await page.getByRole('button', { name: 'DE' }).click()
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Hell' }),
  ).toBeVisible()
  await saved

  await page.reload()
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Hell' }),
  ).toBeVisible()
})

test('T-03-06 dark mode sets the html class and survives reload', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('T-03-07 an unknown URL shows the translated 404 page', async ({
  page,
}) => {
  await page.goto('/this-page-does-not-exist')
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back home' })).toHaveAttribute(
    'href',
    '/',
  )
})

test('T-03-09 login and 404 have no serious axe issues in both themes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Light' }).click()
  await expectNoSeriousViolations(page)
  await shot(page, 'login-light-1280')

  await page.getByRole('button', { name: 'Dark' }).click()
  await expectNoSeriousViolations(page)
  await shot(page, 'login-dark-1280')

  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, 'login-dark-768')
  await expectNoSeriousViolations(page)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/missing-page')
  await page.getByRole('button', { name: 'Light' }).click()
  await expectNoSeriousViolations(page)
  await shot(page, 'not-found-light-1280')

  await page.getByRole('button', { name: 'Dark' }).click()
  await expectNoSeriousViolations(page)
  await shot(page, 'not-found-dark-1280')

  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, 'not-found-dark-768')
  await expectNoSeriousViolations(page)
})

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

async function shot(page: Page, name: string) {
  const image = await page.screenshot()
  await test.info().attach(name, { body: image, contentType: 'image/png' })
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious).toEqual([])
}
