import { expectNoSeriousViolations } from './a11y'
import { expect, test, type Page } from './fixtures'

const japanTrip = '10000000-0000-0000-0000-000000000001'
const fushimiInari = 'Fushimi Inari'

const csv = [
  'Title,URL',
  'With URL,https://maps.google.com/@35.0,135.5,15z',
  'Found By Search,',
  'Not Found Row,',
  `${fushimiInari},https://maps.google.com/@34.967,135.772,15z`,
].join('\r\n')

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockGeocode(page)
})

test('T-23-11 aiko imports a CSV, picks a place for the not-found row, and imports 3 spots (en)', async ({
  page,
}) => {
  await run(page, 'en', {
    importButton: 'Import',
    dialogTitle: 'Import spots',
    mustGo: 'Must go',
    importCount: 'Import 3 spots',
  })
})

test('T-23-11 aiko imports a CSV, picks a place for the not-found row, and imports 3 spots (de)', async ({
  page,
}) => {
  await run(page, 'de', {
    importButton: 'Import',
    dialogTitle: 'Orte importieren',
    mustGo: 'Muss hin',
    importCount: '3 Orte importieren',
  })
})

async function run(
  page: Page,
  locale: 'en' | 'de',
  labels: {
    importButton: string
    dialogTitle: string
    mustGo: string
    importCount: string
  },
) {
  await login(page, '100000000000000002')
  await setLocale(page, locale)
  await page.goto(`/trips/${japanTrip}`)
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

  await dialog.getByRole('radio', { name: labels.mustGo }).check()
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

test('T-23-12 a visitor has no Import button', async ({ page }) => {
  await login(page, '100000000000000003')
  await setLocale(page, 'en')
  await page.goto(`/trips/${japanTrip}`)
  await expect(page.getByRole('button', { name: 'Import' })).toHaveCount(0)
})

test('T-23-12 a .kmz shows the KML hint, a .txt shows an error without preview', async ({
  page,
}) => {
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  await page.goto(`/trips/${japanTrip}`)
  await page.getByRole('button', { name: 'Import' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import spots' })
  const input = dialog.locator('input[type="file"]')

  await input.setInputFiles({
    name: 'Takeout.kmz',
    mimeType: 'application/vnd.google-earth.kmz',
    buffer: Buffer.from('not a real kmz'),
  })
  await expect(dialog.getByText(/Export as KML instead/)).toBeVisible()

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
  await login(page, '100000000000000001')
  await setLocale(page, 'en')
  await page.goto(`/trips/${japanTrip}`)

  const context = await browser.newContext()
  const guest = await context.newPage()
  await guest.setViewportSize({ width: 1280, height: 800 })
  await mockGeocode(guest)
  await login(guest, '100000000000000002')
  await setLocale(guest, 'en')
  await guest.goto(`/trips/${japanTrip}`)

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
  return dialog.locator('li', { hasText: title })
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
