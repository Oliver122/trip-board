import { expect, test, type Page } from '@playwright/test'
import { showLocale } from './locale'
import { freshUser, login } from './low-data'

const pages = [
  ['/trips', 'trips'],
  ['/account', 'account'],
  ['/this-page-does-not-exist', 'not-found'],
] as const

test.beforeEach(async ({ page }) => {
  await showLocale(page, 'en')
})

// Each test has its own user, so parallel specs never share a session.
async function signIn(page: Page) {
  await login(page, freshUser())
}

async function makeTrip(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch('/api/trips', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Japan 2026',
        timezone: 'Asia/Tokyo',
        region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
      }),
    })
    if (!response.ok) throw new Error(await response.text())
    return ((await response.json()) as { id: string }).id
  })
}

for (const width of [390, 768, 360]) {
  test.describe(`T-42-07 header at ${width}`, () => {
    test.use({ viewport: { width, height: 844 } })

    for (const [path, name] of pages) {
      test(`T-42-07 ${name} has a one-row header without a theme switch`, async ({
        page,
      }) => {
        await signIn(page)
        await page.goto(path)
        const header = page.getByRole('banner')
        await expect(header).toBeVisible()
        const box = await header.boundingBox()
        expect(box?.height).toBeLessThanOrEqual(56)
        await expect(header.getByRole('group', { name: 'Theme' })).toHaveCount(
          0,
        )
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        )
        expect(overflow).toBeLessThanOrEqual(0)
        const headerOverflow = await header.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        )
        expect(headerOverflow).toBeLessThanOrEqual(0)
      })
    }
  })
}

test.describe('T-42-07 avatar menu theme', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('T-42-07 the avatar menu switches to dark', async ({ page }) => {
    await signIn(page)
    await page.goto('/trips')
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})

test.describe('T-42-07 desktop header', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('T-42-07 the header switch is there at 1280', async ({ page }) => {
    await signIn(page)
    await page.goto('/trips')
    const header = page.getByRole('banner')
    await expect(header.getByRole('group', { name: 'Theme' })).toBeVisible()
    await expect(header.getByRole('button', { name: 'Dark' })).toBeVisible()
  })
})

test.describe('T-42-07 trip card and settings', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.afterEach(async ({ page }) => {
    await page.evaluate(async () => {
      const response = await fetch('/api/trips', { credentials: 'include' })
      const body = (await response.json()) as { trips: { id: string }[] }
      for (const trip of body.trips) {
        await fetch(`/api/trips/${trip.id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
      }
    })
  })

  test('T-42-07 the card has a 44 px actions menu with Trip settings', async ({
    page,
  }) => {
    await signIn(page)
    await makeTrip(page)
    await page.goto('/trips')
    const actions = page.getByRole('button', {
      name: 'Actions for Japan 2026',
    })
    await expect(actions).toBeVisible()
    const box = await actions.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
    await actions.click()
    await page.getByRole('menuitem', { name: 'Trip settings' }).click()
    await expect(page).toHaveURL(/\/trips\/[^/]+\/settings$/)
  })

  test('T-42-07 phone settings show no heading and no My trips link', async ({
    page,
  }) => {
    await signIn(page)
    const id = await makeTrip(page)
    await page.goto(`/trips/${id}/settings`)
    const main = page.getByRole('main')
    const heading = main.getByRole('heading', { level: 1 })
    await expect(heading).toHaveCount(1)
    const box = await heading.boundingBox()
    expect(box?.width).toBeLessThanOrEqual(1)
    await expect(main.getByRole('link', { name: 'My trips' })).toHaveCount(0)
  })

  test('T-42-07 at 768 the My trips link is at least 44 px high', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await signIn(page)
    const id = await makeTrip(page)
    await page.goto(`/trips/${id}/settings`)
    const link = page.getByRole('main').getByRole('link', { name: 'My trips' })
    await expect(link).toBeVisible()
    const box = await link.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
  })
})
