import { expect, test, type Page } from '@playwright/test'
import { showLocale } from './locale'
import { freshUser, login } from './low-data'

const sven = '100000000000000001'

test.use({ viewport: { width: 390, height: 844 } })

async function japanId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch('/api/trips', { credentials: 'include' })
    const body = (await response.json()) as {
      trips: { id: string; name: string }[]
    }
    return body.trips.find((trip) => trip.name === 'Japan 2026')!.id
  })
}

test('T-42-18 the storage meter shows an empty track at 0 MB', async ({
  page,
}) => {
  await showLocale(page, 'en')
  await login(page, freshUser())
  await page.goto('/account')
  const meter = page.getByTestId('storage-meter')
  const fill = page.getByTestId('storage-meter-fill')
  await expect(meter).toBeVisible()
  expect((await fill.boundingBox())?.width ?? 0).toBeLessThanOrEqual(0.5)
  const colors = await page.evaluate(() => {
    const track = getComputedStyle(
      document.querySelector('[data-testid="storage-meter"]')!,
    ).backgroundColor
    const filling = getComputedStyle(
      document.querySelector('[data-testid="storage-meter-fill"]')!,
    ).backgroundColor
    const page = getComputedStyle(document.body).backgroundColor
    return { track, filling, page }
  })
  expect(colors.track).not.toBe(colors.page)
  expect(colors.track).not.toBe(colors.filling)
})

for (const locale of ['en', 'de'] as const) {
  test(`T-42-18 trip settings date fields use lang ${locale}`, async ({
    page,
  }) => {
    await showLocale(page, locale)
    await login(page, sven)
    await page.goto('/trips')
    const id = await japanId(page)
    await page.goto(`/trips/${id}/settings`)
    const start = page.locator('#trip-settings-start')
    const end = page.locator('#trip-settings-end')
    await expect(start).toHaveAttribute('lang', locale)
    await expect(end).toHaveAttribute('lang', locale)
  })
}

test('T-42-18 the role badge is 12 px and centred on the title line', async ({
  page,
}) => {
  await showLocale(page, 'en')
  await login(page, sven)
  await page.goto('/trips')
  const card = page.getByRole('article').filter({ hasText: 'Japan 2026' })
  const badge = card.getByTestId('role-badge')
  await expect(badge).toBeVisible()
  expect(await badge.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
    '12px',
  )
  const title = await card
    .getByRole('heading', { name: 'Japan 2026' })
    .boundingBox()
  const box = await badge.boundingBox()
  const middle = (value: { y: number; height: number } | null) =>
    (value?.y ?? 0) + (value?.height ?? 0) / 2
  expect(Math.abs(middle(box) - middle(title))).toBeLessThanOrEqual(2)
})
