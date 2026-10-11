import { expectNoSeriousViolations } from './a11y'
import { expect, test, type Browser, type Page } from './fixtures'

const svenId = '100000000000000001'
const aikoId = '100000000000000002'
const tomId = '100000000000000003'
const fushimiInari = 'Fushimi Inari'

const csv = [
  'Title,URL',
  // The URLs carry commas, so a real export quotes them.
  'With URL,"https://maps.google.com/@35.0,135.5,15z"',
  'Found By Search,',
  'Not Found Row,',
  `${fushimiInari},"https://maps.google.com/@34.967,135.772,15z"`,
].join('\r\n')

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockGeocode(page)
})

test('T-23-11 aiko imports a CSV, picks a place for the not-found row, and imports 3 spots (en)', async ({
  browser,
  page,
}) => {
  await run(page, browser, 'en', {
    importButton: 'Import',
    dialogTitle: 'Import spots',
    mustGo: 'Must go',
    importCount: 'Import 3 spots',
  })
})

test('T-23-11 aiko imports a CSV, picks a place for the not-found row, and imports 3 spots (de)', async ({
  browser,
  page,
}) => {
  await run(page, browser, 'de', {
    importButton: 'Import',
    dialogTitle: 'Orte importieren',
    mustGo: 'Muss hin',
    importCount: '3 Orte importieren',
  })
})

async function run(
  page: Page,
  browser: Browser,
  locale: 'en' | 'de',
  labels: {
    importButton: string
    dialogTitle: string
    mustGo: string
    importCount: string
  },
) {
  // The language is stored on the account, so these runs plan as a user of
  // their own; switching the shared Aiko would race specs that expect English.
  const plannerId = `9${Date.now()}${Math.floor(Math.random() * 1e4)}`
  const tripId = await newTrip(browser, plannerId)
  await login(page, plannerId)
  await setLocale(page, locale)
  await page.goto(`/trips/${tripId}`)
  // The duplicate check reads the spots the board has loaded by now.
  await expect(
    page.getByTestId('spot-list').getByRole('button', { name: fushimiInari }),
  ).toBeVisible()
  await page.getByRole('button', { name: labels.importButton }).click()

  const dialog = page.getByRole('dialog', { name: labels.dialogTitle })
  await expect(dialog).toBeVisible()
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'kyoto.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  })

  const withUrlRow = rowFor(dialog, 'With URL')
  const foundRow = rowFor(dialog, 'Found By Search')
  const notFoundRow = rowFor(dialog, 'Not Found Row')
  const duplicateRow = rowFor(dialog, fushimiInari)

  await expect(withUrlRow.getByRole('checkbox')).toBeChecked()
  await expect(foundRow.getByRole('checkbox')).toBeChecked()
  await expect(notFoundRow.getByRole('checkbox')).not.toBeChecked()
  await expect(duplicateRow.getByRole('checkbox')).not.toBeChecked()

  await shot(page, `import-preview-1280-${locale}`)
  await expectNoSeriousViolations(page, { include: '[role="dialog"]' })
  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, `import-preview-768-${locale}`)
  await page.setViewportSize({ width: 1280, height: 800 })

  await notFoundRow
    .getByPlaceholder(/./)
    .fill(locale === 'en' ? 'Osaka' : 'Osaka')
  await notFoundRow.getByRole('button', { name: /Picked Place/ }).click()
  await expect(notFoundRow.getByRole('checkbox')).toBeChecked()

  const mustGoChip = dialog.getByRole('button', {
    name: labels.mustGo,
    exact: true,
  })
  await expect(mustGoChip).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: labels.importCount }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByTestId('spot-list').getByRole('button', { name: /With URL/ }),
  ).toBeVisible()
  await expect(
    page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Found By Search/ }),
  ).toBeVisible()
  await expect(
    page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Not Found Row/ }),
  ).toBeVisible()

  await expectNoSeriousViolations(page)
}

test('T-23-12 a visitor has no Import button', async ({ browser, page }) => {
  const tripId = await newTrip(browser)
  await login(page, tomId)
  await setLocale(page, 'en')
  await page.goto(`/trips/${tripId}`)
  await expect(page.getByRole('button', { name: 'Import' })).toHaveCount(0)
})

test('T-23-12 a .kmz shows the KML hint, a .txt shows an error without preview', async ({
  browser,
  page,
}) => {
  const tripId = await newTrip(browser)
  await login(page, aikoId)
  await setLocale(page, 'en')
  await page.goto(`/trips/${tripId}`)
  await page.getByRole('button', { name: 'Import' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import spots' })
  const input = dialog.locator('input[type="file"]')

  await input.setInputFiles({
    name: 'Takeout.kmz',
    mimeType: 'application/vnd.google-earth.kmz',
    buffer: Buffer.from('not a real kmz'),
  })
  await expect(dialog.getByRole('alert')).toContainText(/Export as KML instead/)

  await input.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  })
  await expect(dialog.getByText(/This file can.t be read/)).toBeVisible()
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
})

test('T-23-13 Aiko importing 2 spots appears on Sven’s board without reload', async ({
  browser,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockGeocode(page)
  const tripId = await newTrip(browser)
  await login(page, svenId)
  await setLocale(page, 'en')
  await page.goto(`/trips/${tripId}`)

  const context = await browser.newContext()
  const guest = await context.newPage()
  await guest.setViewportSize({ width: 1280, height: 800 })
  await mockGeocode(guest)
  await login(guest, aikoId)
  await setLocale(guest, 'en')
  await guest.goto(`/trips/${tripId}`)

  await guest.getByRole('button', { name: 'Import' }).click()
  const dialog = guest.getByRole('dialog', { name: 'Import spots' })
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'two.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      ['Title,URL', 'Live One,', 'Live Two,'].join('\r\n'),
      'utf8',
    ),
  })
  await expect(dialog.getByRole('checkbox').first()).toBeChecked()
  await dialog.getByRole('button', { name: /Import \d spots/ }).click()
  await expect(guest.getByRole('dialog')).toHaveCount(0)

  await expect(
    page.getByTestId('spot-list').getByRole('button', { name: /Live One/ }),
  ).toBeVisible({ timeout: 4000 })
  await expect(
    page.getByTestId('spot-list').getByRole('button', { name: /Live Two/ }),
  ).toBeVisible()

  await context.close()
})

function rowFor(dialog: ReturnType<Page['getByRole']>, title: string) {
  // A row's status line also reads "Found by search", so match the title only.
  return dialog
    .locator('li')
    .filter({ has: dialog.page().getByText(title, { exact: true }) })
}

async function shot(page: Page, name: string) {
  const image = await page.screenshot()
  await test.info().attach(name, { body: image, contentType: 'image/png' })
}

async function mockGeocode(page: Page) {
  await page.route('**/api/geocode/search**', (route) => {
    const url = new URL(route.request().url())
    const q = (url.searchParams.get('q') ?? '').trim()
    if (q === 'Not Found Row') {
      return route.fulfill({ json: { results: [] } })
    }
    if (q.startsWith('Found By Search')) {
      return route.fulfill({
        json: {
          results: [
            { label: 'Shibuya Sky, Tokyo', lat: 35.6586, lng: 139.7454 },
          ],
        },
      })
    }
    return route.fulfill({
      json: {
        results: [{ label: 'Picked Place, Japan', lat: 34.69, lng: 135.19 }],
      },
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

// A trip of its own per test: imports add spots, which would skew the seeded
// trip the other specs count, and a second import of the same file would
// flag the first one's spots as duplicates. Aiko plans it, Tom only visits,
// and Fushimi Inari is already on it so the CSV has a duplicate row.
async function newTrip(browser: Browser, plannerId = aikoId): Promise<string> {
  const sven = await newSession(browser, svenId)
  const created = await sven.page.evaluate(async (title) => {
    const post = async (path: string, body: unknown) => {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(await response.text())
      return (await response.json()) as { id: string; code: string }
    }
    const trip = await post('/api/trips', {
      name: 'Import e2e',
      timezone: 'Asia/Tokyo',
      region: {
        bbox: { minLng: 122.94, minLat: 24.4, maxLng: 145.82, maxLat: 45.55 },
      },
    })
    await post(`/api/trips/${trip.id}/spots`, {
      title,
      lat: 34.967,
      lng: 135.772,
      baseCategory: 'maybe',
      address: 'Kyoto',
    })
    const planner = await post(`/api/trips/${trip.id}/invites`, {
      role: 'planner',
    })
    const visitor = await post(`/api/trips/${trip.id}/invites`, {
      role: 'visitor',
    })
    return { id: trip.id, planner: planner.code, visitor: visitor.code }
  }, fushimiInari)
  await sven.context.close()

  for (const [discordId, code] of [
    [plannerId, created.planner],
    [tomId, created.visitor],
  ] as const) {
    const member = await newSession(browser, discordId)
    await member.page.evaluate(async (invite) => {
      const response = await fetch(`/api/join/${invite}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error(await response.text())
    }, code)
    await member.context.close()
  }
  return created.id
}

async function newSession(browser: Browser, discordId: string) {
  const context = await browser.newContext({ locale: 'en-US' })
  const page = await context.newPage()
  await login(page, discordId)
  return { context, page }
}
