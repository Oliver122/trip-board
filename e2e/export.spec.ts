import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'

test('T-14-09 the export dialog names the current view and downloads a CSV', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, '100000000000000001')
  await setLocale(page, 'en')
  await page.goto(japanTrip)
  await page.getByRole('button', { name: 'Filter' }).click()
  await page.getByRole('checkbox', { name: 'Must go' }).click()
  await page.getByRole('checkbox', { name: 'Maybe' }).click()
  await page.getByRole('button', { name: 'Export' }).click()

  const dialog = page.getByRole('dialog', { name: /Export .*Japan 2026/ })
  await expect(
    dialog.getByRole('radio', { name: 'Current view (2 filters)' }),
  ).toBeVisible()
  await expect(dialog.getByRole('radio', { name: 'Full list' })).toBeChecked()
  await expect(dialog.getByRole('radio', { name: 'CSV' })).toBeChecked()
  await dialog.getByRole('radio', { name: 'Current view (2 filters)' }).click()

  await shot(page, 'export-1280')
  await expectNoSeriousViolations(page)

  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, 'export-768')
  await expectNoSeriousViolations(page)

  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('link', { name: 'Download' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(`japan-2026-${tokyoDate()}.csv`)
})

function tokyoDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00'
  return `${pick('year')}-${pick('month')}-${pick('day')}`
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
