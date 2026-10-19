import { expect, test, type Page } from '@playwright/test'
import {
  deleteCreatedTrips,
  freshUser,
  login,
  tripWithPhotos,
} from './low-data'

const sven = '100000000000000001'
const tripSection = 'Trip sections'

test.use({ viewport: { width: 390, height: 844 } })

test.afterEach(async ({ page }) => {
  await deleteCreatedTrips(page)
})

async function openBoard(page: Page, name: string, query = '', photos = 3) {
  const user = freshUser()
  await login(page, user)
  const made = await tripWithPhotos(page, name, photos)
  await page.goto(`/trips/${made.tripId}${query}`)
  return { ...made, user }
}

async function addPlan(page: Page, tripId: string, spotId: string) {
  await page.evaluate(
    async ({ trip, spot }) => {
      const json = { 'content-type': 'application/json' }
      const bucket = (await (
        await fetch(`/api/trips/${trip}/plan`, {
          method: 'POST',
          credentials: 'include',
          headers: json,
          body: JSON.stringify({
            type: 'bucket',
            title: 'Kyoto days',
            startDate: '2026-04-10',
            endDate: '2026-04-12',
          }),
        })
      ).json()) as { id: string }
      const response = await fetch(`/api/plan/${bucket.id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: json,
        body: JSON.stringify({ spotId: spot, visitDate: '2026-04-10' }),
      })
      if (!response.ok) throw new Error(await response.text())
    },
    { trip: tripId, spot: spotId },
  )
}

test(
  'T-38-01 phone has a bottom bar, a compact header and a More sheet',
  { tag: '@mobile' },
  async ({ page }) => {
    const { tripId } = await openBoard(page, 'Phone bar')
    const bar = page.getByRole('navigation', { name: tripSection })
    await expect(bar).toBeVisible()
    for (const name of ['Map', 'List', 'Schedule', 'More']) {
      const tab = bar.getByRole(name === 'More' ? 'button' : 'link', { name })
      await expect(tab).toBeVisible()
      expect((await tab.boundingBox())?.height).toBeGreaterThanOrEqual(48)
    }
    await expect(bar.getByRole('link', { name: 'Map' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByTestId('sheet-handle')).toHaveCount(0)
    await expect(page.getByTestId('spot-list')).toHaveCount(0)

    const header = page.locator('header')
    expect((await header.boundingBox())?.height).toBeLessThanOrEqual(49)
    await expect(header.getByRole('link', { name: 'My trips' })).toBeVisible()
    await expect(header.getByTestId('trip-name')).toHaveText('Phone bar')
    await expect(
      header.getByRole('button', { name: 'Account menu' }),
    ).toBeVisible()
    for (const name of ['Board', 'Schedule', 'Settings']) {
      await expect(header.getByRole('link', { name })).toHaveCount(0)
    }
    await expect(header.getByTestId('news-button')).toHaveCount(0)
    await expect(header.getByRole('group', { name: 'Theme' })).toHaveCount(0)

    await bar.getByRole('button', { name: 'More' }).click()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await expect(sheet.getByRole('link', { name: 'Settings' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Members' })).toBeVisible()
    await expect(sheet.getByTestId('more-news')).toBeVisible()
    await expect(sheet.getByTestId('data-saver-switch')).toBeVisible()
    await expect(sheet.getByRole('group', { name: 'Theme' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Close' }).click()

    await bar.getByRole('link', { name: 'Schedule' }).click()
    await expect(page).toHaveURL(new RegExp(`/trips/${tripId}/schedule$`))
  },
)

test(
  'T-38-02 Map and List are one route with a kept map',
  { tag: '@mobile' },
  async ({ page }) => {
    const { tripId } = await openBoard(page, 'Phone views')
    const bar = page.getByRole('navigation', { name: tripSection })
    const canvas = page.locator('canvas.maplibregl-canvas')
    await expect(canvas).toHaveCount(1)
    await expect(canvas).toBeVisible()

    await bar.getByRole('link', { name: 'List' }).click()
    await expect(page).toHaveURL(/\?view=list$/)
    const list = page.getByTestId('spot-list')
    await expect(list).toBeVisible()
    await expect(canvas).toBeHidden()
    await expect(canvas).toHaveCount(1)

    await page.goBack()
    await expect(page).not.toHaveURL(/view=list/)
    await expect(list).toHaveCount(0)
    await expect(canvas).toBeVisible()

    await page.goForward()
    await page.reload()
    await expect(page.getByTestId('spot-list')).toBeVisible()
    await expect(bar.getByRole('link', { name: 'List' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await page.getByRole('checkbox', { name: 'Only visible on map' }).uncheck()
    await page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Kinkaku-ji/ })
      .click()
    await expect(page).toHaveURL(/view=list/)
    const panel = page.getByRole('dialog')
    await panel.getByTestId('show-on-map').click()
    await expect(panel).toHaveCount(0)
    await expect(page).not.toHaveURL(/view=list/)
    await expect(canvas).toBeVisible()
    await expect(canvas).toHaveCount(1)

    await page.goto(`/trips/${tripId}?view=list`)
    await expect(page.getByTestId('spot-list')).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByTestId('spot-list')).toHaveAttribute(
      'data-layout',
      'docked',
    )
    await expect(canvas).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: tripSection }),
    ).toHaveCount(0)
  },
)

test(
  'T-38-03 the phone panel has collapsible sections',
  { tag: '@mobile' },
  async ({ page }) => {
    await openBoard(page, 'Phone panel', '?view=list')
    await page.getByRole('checkbox', { name: 'Only visible on map' }).uncheck()
    await page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Kinkaku-ji/ })
      .click()
    const panel = page.getByRole('dialog')
    const section = (name: RegExp | string) =>
      panel.getByRole('button', { name })
    await expect(section('Details')).toHaveAttribute('aria-expanded', 'true')
    for (const name of ['Photos (3)', 'In plans (0)', 'Comments (0)']) {
      await expect(section(name)).toHaveAttribute('aria-expanded', 'false')
    }
    await section('Photos (3)').click()
    await expect(section('Photos (3)')).toHaveAttribute('aria-expanded', 'true')
    await section('Comments (0)').click()
    await expect(section('Comments (0)')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await expect(section('Photos (3)')).toHaveAttribute(
      'aria-expanded',
      'false',
    )

    await panel.getByRole('textbox', { name: 'Title', exact: true }).fill('X')
    await panel.getByRole('button', { name: 'Back' }).first().click()
    await expect(page.getByText('Discard unsaved changes?')).toBeVisible()
  },
)

test(
  'T-38-04 the phone hides bulk and setup work until the screen is wide',
  { tag: '@mobile' },
  async ({ page }) => {
    test.setTimeout(90_000)
    const { tripId, spotId, user } = await openBoard(page, 'Phone hides')
    await addPlan(page, tripId, spotId)

    // Board toolbar.
    await page.goto(`/trips/${tripId}?view=list`)
    await expect(page.getByTestId('filters')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0)

    // Gallery.
    await page.getByRole('checkbox', { name: 'Only visible on map' }).uncheck()
    await page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Kinkaku-ji/ })
      .click()
    await page.getByRole('button', { name: /^Photos/ }).click()
    await expect(page.locator('input[type="file"]').first()).toHaveAttribute(
      'accept',
      'image/*',
    )
    await expect(page.getByText('Find images on Google')).toHaveCount(0)
    await page.getByRole('button', { name: 'Back' }).first().click()

    // Settings.
    await page.goto(`/trips/${tripId}/settings`)
    await expect(
      page.getByText('Manage spot kinds on a larger screen.'),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Spot kinds' })).toHaveCount(
      0,
    )

    // Schedule.
    await page.goto(`/trips/${tripId}/schedule`)
    await expect(
      page.getByRole('button', { name: /Move .* up/i }).first(),
    ).toBeAttached()
    await expect(page.locator('[data-testid^="drag-"]')).toHaveCount(0)

    // Account.
    await page.goto('/account')
    await expect(
      page.getByRole('heading', { name: 'Send places from Google Maps' }),
    ).toHaveCount(0)
    await expect(page.getByTestId('data-saver-setting')).toBeVisible()

    // Admin.
    await login(page, sven)
    await page.goto('/admin')
    await expect(page.getByTestId('admin-phone-notice')).toBeVisible()

    // Everything returns without a reload.
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByTestId('admin-phone-notice')).toHaveCount(0)
    await login(page, user)
    await page.goto('/account')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(
      page.getByRole('heading', { name: 'Send places from Google Maps' }),
    ).toHaveCount(0)
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(
      page.getByRole('heading', { name: 'Send places from Google Maps' }),
    ).toBeVisible()

    await page.goto(`/trips/${tripId}/settings`)
    await expect(
      page.getByRole('heading', { name: 'Spot kinds' }),
    ).toBeVisible()
    await page.goto(`/trips/${tripId}/schedule`)
    await expect(page.locator('[data-testid^="drag-"]').first()).toBeVisible()
    await page.goto(`/trips/${tripId}`)
    await expect(page.getByRole('button', { name: 'Import' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export' })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: 'Import' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0)
  },
)

test(
  'T-38-12 Open in Google Maps in the panel uses the saved point',
  { tag: '@mobile' },
  async ({ page }) => {
    const { tripId } = await openBoard(page, 'Phone maps link', '?view=list')
    await page.getByRole('checkbox', { name: 'Only visible on map' }).uncheck()
    await page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Kinkaku-ji/ })
      .click()
    const link = page.getByRole('dialog').getByRole('link', {
      name: 'Open in Google Maps',
    })
    const href =
      'https://www.google.com/maps/search/?api=1&query=35.0394,135.7292'
    await expect(link).toHaveAttribute('href', href)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    // Add mode has no link.
    await page.getByRole('button', { name: 'Back' }).first().click()
    await page.goto(`/trips/${tripId}`)
    await page.getByTestId('add-new').click()
    await expect(
      page.getByRole('link', { name: 'Open in Google Maps' }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Back' }).first().click()

    // A dragged, unsaved pin does not change the href.
    await page.goto(`/trips/${tripId}?view=list`)
    await page.getByRole('checkbox', { name: 'Only visible on map' }).uncheck()
    await page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Kinkaku-ji/ })
      .click()
    await page.getByRole('combobox', { name: 'Address' }).fill('Moved')
    await expect(
      page
        .getByRole('dialog')
        .getByRole('link', { name: 'Open in Google Maps' }),
    ).toHaveAttribute('href', href)
  },
)

test(
  'T-38-13 list cards on the phone link to Google Maps without opening the panel',
  { tag: '@mobile' },
  async ({ page }) => {
    await openBoard(page, 'Phone card link', '?view=list')
    await page.getByRole('checkbox', { name: 'Only visible on map' }).uncheck()
    const link = page.getByRole('link', {
      name: 'Open Kinkaku-ji in Google Maps',
    })
    await expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=35.0394,135.7292',
    )
    await expect(link).toHaveAttribute('target', '_blank')
    await page
      .context()
      .route('https://www.google.com/**', (route) =>
        route.fulfill({ body: 'maps', contentType: 'text/plain' }),
      )
    const popup = page.waitForEvent('popup')
    await link.click()
    const opened = await popup
    expect(opened.url()).toContain('google.com/maps/search')
    await opened.close()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  },
)

test('G-6 screenshots of the board and the panel at 1280, 768 and 390 px', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const { tripId } = await openBoard(page, 'Phone screenshots')
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.goto(`/trips/${tripId}${width === 390 ? '?view=list' : ''}`)
    await page.getByRole('checkbox', { name: 'Only visible on map' }).uncheck()
    await expect(page.getByTestId('spot-list')).toBeVisible()
    await page.screenshot({
      path: `test-results/step-38/board-${width}.png`,
    })
    await page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Kinkaku-ji/ })
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.screenshot({
      path: `test-results/step-38/panel-${width}.png`,
    })
  }
})

const mapsHref =
  'https://www.google.com/maps/search/?api=1&query=35.0394,135.7292'

test('T-38-12 a visitor sees Open in Google Maps at 1280 px and dragging the pin keeps the saved point', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  const { tripId } = await openBoard(page, 'Maps link visitor', '', 0)

  // Tom joins as a visitor through an invite the planner made.
  const code = await page.evaluate(async (id) => {
    const response = await fetch(`/api/trips/${id}/invites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'visitor' }),
    })
    if (!response.ok) throw new Error(await response.text())
    return ((await response.json()) as { code: string }).code
  }, tripId)
  const context = await browser.newContext({ locale: 'en-US' })
  const tom = await context.newPage()
  await tom.setViewportSize({ width: 1280, height: 800 })
  await login(tom, '100000000000000003')
  await tom.evaluate(async (invite) => {
    const response = await fetch(`/api/join/${invite}`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) throw new Error(await response.text())
  }, code)
  await tom.goto(`/trips/${tripId}`)
  await tom
    .getByTestId('spot-list')
    .getByRole('button', { name: /Kinkaku-ji/ })
    .click()
  const visitorLink = tom
    .getByRole('dialog')
    .getByRole('link', { name: 'Open in Google Maps' })
  await expect(visitorLink).toHaveAttribute('href', mapsHref)
  await expect(visitorLink).toHaveAttribute('target', '_blank')
  await expect(visitorLink).toHaveAttribute('rel', 'noopener noreferrer')
  await context.close()

  // Planner: drag the pin of the open spot without saving.
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Kinkaku-ji/ })
    .click()
  const pin = page.getByTestId('draft-pin')
  await expect(pin).toBeVisible()
  const box = await pin.boundingBox()
  if (!box) throw new Error('draft pin has no box')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 120, y + 60, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
  await expect(
    page.getByRole('dialog').getByRole('link', { name: 'Open in Google Maps' }),
  ).toHaveAttribute('href', mapsHref)
})
