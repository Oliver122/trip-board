import { expectNoSeriousViolations } from './a11y'
import { expect, test, type Page } from './fixtures'
import { showLocale } from './locale'

const sven = '100000000000000001'

type Browser = Parameters<Parameters<typeof test>[2]>[0]['browser']
type Kind = { id: string; name: string | null; symbol: string }

function freshDiscordId() {
  return `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`.slice(0, 18)
}

async function login(page: Page, discordId: string) {
  await page.goto('/login')
  await api(page, 'POST', '/test/login', { discordId })
}

async function api<T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return page.evaluate(
    async (input) => {
      const response = await fetch(`/api${input.path}`, {
        method: input.method,
        credentials: 'include',
        headers:
          input.body === undefined
            ? {}
            : { 'content-type': 'application/json' },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      })
      if (!response.ok) {
        throw new Error(`${input.method} ${input.path} ${response.status}`)
      }
      return response.status === 204 ? null : await response.json()
    },
    { method, path, body },
  ) as Promise<T>
}

async function createTrip(page: Page): Promise<string> {
  const trip = await api<{ id: string }>(page, 'POST', '/trips', {
    name: `Catalog ${Date.now()}`,
    timezone: 'Asia/Tokyo',
    region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
  })
  return trip.id
}

async function listKinds(page: Page, tripId: string): Promise<Kind[]> {
  const body = await api<{ kinds: Kind[] }>(
    page,
    'GET',
    `/trips/${tripId}/kinds`,
  )
  return body.kinds
}

async function openDialog(page: Page) {
  await page.getByTestId('board-menu').click()
  await page.getByTestId('board-menu-kinds').click()
  const dialog = page.getByTestId('kinds-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('kind-row').first()).toBeVisible()
  return dialog
}

async function openCustomForm(dialog: ReturnType<Page['locator']>) {
  await dialog.getByTestId('kind-add-menu').click()
  await dialog.getByTestId('kind-add-custom').click()
  const form = dialog.locator('form[aria-labelledby]').first()
  await expect(form).toBeVisible()
  return form
}

async function ownerPage(page: Page, discordId = freshDiscordId()) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page, discordId)
  return createTrip(page)
}

test('T-29-09 the Add kind menu lists missing presets and picks one at once @chromium', async ({
  page,
}) => {
  test.setTimeout(30_000)
  await showLocale(page, 'en')
  const tripId = await ownerPage(page)
  await page.goto(`/trips/${tripId}`)
  const dialog = await openDialog(page)

  await dialog.getByTestId('kind-add-menu').click()
  const items = page.getByRole('menuitem')
  await expect(items).toHaveText([
    'Shopping',
    'Coffee',
    'Nature',
    'Nightlife',
    'Custom kind…',
  ])
  await page.getByRole('menuitem', { name: 'Coffee' }).click()
  await expect(
    dialog.getByRole('textbox', { name: 'Name of Coffee' }),
  ).toBeVisible()
  await expect(dialog.getByTestId('kind-total')).toHaveText('5 of 12 kinds')
  const kinds = await listKinds(page, tripId)
  expect(
    kinds.find((kind) => kind.name === null && kind.symbol === 'coffee'),
  ).toBeTruthy()

  const form = await openCustomForm(dialog)
  const pin = form.getByTestId('kind-preview-pin').locator('[data-kind-colors]')
  await expect(pin).toHaveAttribute('data-kind-colors', '#D9480F')
  await form.getByRole('button', { name: '#0F766E' }).click()
  await expect(pin).toHaveAttribute('data-kind-colors', '#0F766E')
  await form.getByRole('option', { name: 'Camera' }).click()
  await expect(pin.locator('[data-icon="camera"]')).toBeVisible()
})

test('T-29-09 Escape closes only the Add kind menu and returns focus to its trigger @chromium', async ({
  page,
}) => {
  test.setTimeout(30_000)
  await showLocale(page, 'en')
  const tripId = await ownerPage(page)
  await page.goto(`/trips/${tripId}`)
  const dialog = await openDialog(page)
  const trigger = dialog.getByTestId('kind-add-menu')
  await trigger.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await expectNoSeriousViolations(page, {
    include: '[data-testid="kinds-dialog"]',
  })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(trigger).toBeFocused()

  // The menu opens again and still reaches the custom form.
  await openCustomForm(dialog)
})

test('T-29-10 the symbol picker searches in German and picks by keyboard @chromium', async ({
  page,
}) => {
  test.setTimeout(30_000)
  await showLocale(page, 'de')
  const tripId = await ownerPage(page)
  await page.goto(`/trips/${tripId}`)
  const dialog = await openDialog(page)
  const form = await openCustomForm(dialog)

  const search = form.getByRole('searchbox')
  await search.fill('kat')
  await expect(form.getByRole('option', { name: 'Katze' })).toBeVisible()
  await search.fill('zzz')
  await expect(form.getByText('Kein Symbol passt')).toBeVisible()
  await expect(form.getByRole('option')).toHaveCount(0)

  await search.fill('kat')
  await search.press('ArrowDown')
  await expect(form.getByRole('option', { name: 'Katze' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(form.getByRole('option', { name: 'Katze' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  await form.getByTestId('kind-name-input').fill('Katzencafé')
  await form.locator('button[type="submit"]').click()
  await expect(
    dialog.getByRole('textbox', { name: /Katzencafé/ }),
  ).toBeVisible()
  const kinds = await listKinds(page, tripId)
  expect(kinds.find((kind) => kind.name === 'Katzencafé')?.symbol).toBe('cat')

  // Arrow keys move through the grid.
  const second = await openCustomForm(dialog)
  const first = second.getByRole('option').first()
  await first.focus()
  await page.keyboard.press('ArrowRight')
  await expect(second.getByRole('option').nth(1)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  const focused = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-symbol'),
  )
  expect(focused).not.toBeNull()
  await page.keyboard.press('Enter')
  await expect(second.locator(`[data-symbol="${focused}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('T-29-11 a board at its kind limit requests more and gets them live @chromium', async ({
  page,
  browser,
}: {
  page: Page
  browser: Browser
}) => {
  test.setTimeout(60_000)
  await showLocale(page, 'en')
  const tripId = await ownerPage(page, sven)
  await api(page, 'PATCH', `/admin/trips/${tripId}/kind-limit`, {
    maxKinds: 4,
  })
  await page.goto(`/trips/${tripId}`)
  const dialog = await openDialog(page)

  await expect(dialog.getByRole('button', { name: 'Add kind' })).toBeDisabled()
  await expect(dialog.getByText('Kind limit reached')).toBeVisible()
  await expect(dialog.getByTestId('kind-total')).toHaveText('4 of 4 kinds')
  await dialog.getByRole('button', { name: 'Request more' }).click()
  await dialog.getByLabel('Number of kinds').fill('14')
  await dialog.getByRole('button', { name: 'Send request' }).click()
  await expect(dialog.getByText('Request for 14 kinds pending')).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Request more' }),
  ).toHaveCount(0)

  const context = await browser.newContext()
  const admin = await context.newPage()
  await showLocale(admin, 'en')
  await admin.setViewportSize({ width: 1280, height: 900 })
  await login(admin, sven)
  await admin.goto('/admin/requests')
  const item = admin
    .getByTestId('request-item')
    .filter({ has: admin.locator(`a[href="/admin/trips/${tripId}"]`) })
  await expect(item.getByTestId('request-type')).toHaveText('Spot kinds')
  await item.getByRole('button', { name: 'Approve' }).click()

  await expect(dialog.getByTestId('kind-total')).toHaveText('4 of 14 kinds')
  await expect(dialog.getByRole('button', { name: 'Add kind' })).toBeEnabled()
  await expect(
    dialog.getByText('Your request for 14 kinds was approved.'),
  ).toBeVisible()
  await context.close()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`T-29-23 the Spot kinds dialog passes axe with menu, symbol picker and request form in ${scheme} mode @chromium`, async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.emulateMedia({ colorScheme: scheme })
    await showLocale(page, 'en')
    const tripId = await ownerPage(page, sven)
    await api(page, 'PATCH', `/admin/trips/${tripId}/kind-limit`, {
      maxKinds: 5,
    })
    await page.goto(`/trips/${tripId}`)
    const dialog = await openDialog(page)
    const scope = { include: '[data-testid="kinds-dialog"]' }

    await dialog.getByTestId('kind-add-menu').click()
    await expect(page.getByRole('menu')).toBeVisible()
    await expectNoSeriousViolations(page, { ...scope, label: `menu ${scheme}` })
    await dialog.getByTestId('kind-add-custom').click()
    const form = dialog.locator('form[aria-labelledby]').first()
    await expect(form).toBeVisible()
    await form.getByRole('searchbox').fill('a')
    await expectNoSeriousViolations(page, {
      ...scope,
      label: `picker ${scheme}`,
    })
    await form.getByRole('button', { name: 'Cancel' }).click()

    // One more kind reaches the limit of 5; then the request form shows.
    await dialog.getByTestId('kind-add-menu').click()
    await page.getByRole('menuitem', { name: 'Coffee' }).click()
    await expect(dialog.getByTestId('kind-total')).toHaveText('5 of 5 kinds')
    await dialog.getByRole('button', { name: 'Request more' }).click()
    await expect(dialog.getByLabel('Number of kinds')).toBeVisible()
    await expectNoSeriousViolations(page, {
      ...scope,
      label: `request ${scheme}`,
    })
  })
}
