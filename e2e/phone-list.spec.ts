import { expect, test, type Page } from '@playwright/test'
import { showLocale } from './locale'
import { login } from './low-data'

const sven = '100000000000000001'

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  await showLocale(page, 'en')
})

async function openList(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('theme', value)
    } catch {
      /* no storage */
    }
  }, theme)
  await login(page, sven)
  const id = await page.evaluate(async () => {
    const response = await fetch('/api/trips', { credentials: 'include' })
    const body = (await response.json()) as {
      trips: { id: string; name: string }[]
    }
    return body.trips.find((trip) => trip.name === 'Japan 2026')!.id
  })
  await page.goto(`/trips/${id}?view=list`)
  await expect(page.getByTestId('spot-list')).toBeVisible()
}

/** WCAG contrast of the divider text on the list's background. */
async function dividerContrast(page: Page): Promise<number> {
  return page.getByTestId('unscheduled-divider').evaluate((element) => {
    const rgb = (color: string): number[] => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d')!
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const luminance = (channels: number[]) => {
      const [r, g, b] = channels.map((value) => {
        const unit = value / 255
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    let background = element as HTMLElement | null
    let backdrop = 'rgb(255, 255, 255)'
    while (background) {
      const color = getComputedStyle(background).backgroundColor
      if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
        backdrop = color
        break
      }
      background = background.parentElement
    }
    const text = element.querySelector('span') as HTMLElement
    const a = luminance(rgb(getComputedStyle(text).color))
    const b = luminance(rgb(backdrop))
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`T-42-10 the Not scheduled yet divider is 12 px and readable in ${theme}`, async ({
    page,
  }) => {
    await openList(page, theme)
    const divider = page.getByTestId('unscheduled-divider')
    await divider.scrollIntoViewIfNeeded()
    await expect(divider).toBeVisible()
    const size = await divider
      .locator('span')
      .first()
      .evaluate((element) => getComputedStyle(element).fontSize)
    expect(size).toBe('12px')
    expect(await dividerContrast(page)).toBeGreaterThanOrEqual(4.5)
  })
}

test('T-42-10 Only visible on map is a 44 px switch beside Filters', async ({
  page,
}) => {
  await openList(page, 'light')
  const filters = page.getByTestId('filters')
  const toggle = page.getByRole('switch', { name: 'Only visible on map' })
  await expect(toggle).toBeVisible()
  const row = await toggle.locator('xpath=ancestor::label').boundingBox()
  const filtersBox = await filters.boundingBox()
  expect(row?.height).toBeGreaterThanOrEqual(44)
  expect(Math.abs((row?.y ?? 0) - (filtersBox?.y ?? 0))).toBeLessThan(30)
  expect(row?.x).toBeGreaterThan(
    (filtersBox?.x ?? 0) + (filtersBox?.width ?? 0),
  )

  const cards = page.getByTestId('spot-list-items').getByRole('listitem')
  await toggle.uncheck()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  const all = await cards.count()
  await toggle.check()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(await cards.count()).toBeLessThanOrEqual(all)
})

test('T-42-10 List follows map on the account page is a switch', async ({
  page,
}) => {
  await login(page, sven)
  await page.goto('/account')
  const toggle = page.getByRole('switch', { name: 'List follows map' })
  await expect(toggle).toBeVisible()
  const before = await toggle.getAttribute('aria-checked')
  await toggle.click()
  await expect(toggle).not.toHaveAttribute('aria-checked', before ?? '')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', before ?? '')
})
