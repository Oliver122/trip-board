import { inflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { focusByKeyboard } from './keyboard'

const xss = '<img src=x onerror=alert(1)>'

// R-42-20: from 640 to 1023 px the side sheet covers the list column and the
// map stays visible to its left.
test('T-15-01 at 800 px the side sheet covers the list and leaves the map', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 })
  await login(page, '100000000000000002')
  const tripId = await createTrip(page, 'Tablet sheet')
  await createSpot(page, tripId, 'Kyoto tower')
  await page.goto(`/trips/${tripId}`)
  const list = page.getByTestId('spot-list')
  await expect(list).toBeVisible()
  await list.getByRole('button', { name: /Kyoto tower/ }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  const listBox = await list.boundingBox()
  const sheetBox = await sheet.boundingBox()
  expect(listBox?.width).toBeGreaterThan(200)
  expect(listBox?.width).toBeLessThan(360)
  expect(sheetBox && listBox).toBeTruthy()
  if (!sheetBox || !listBox) return
  expect(sheetBox.x).toBeGreaterThanOrEqual(480)
  expect(sheetBox.x + sheetBox.width).toBeCloseTo(800, 0)
  expect(sheetBox.height).toBeGreaterThan(400)
})

test(
  'T-15-02 phone list tab, filters, and full-screen panel',
  { tag: '@mobile' },
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, '100000000000000002')
    const tripId = await createTrip(page, 'Phone list')
    await createSpot(page, tripId, 'Dotonbori')
    await page.goto(`/trips/${tripId}?view=list`)
    const list = page.getByTestId('spot-list')
    await expect(list).toHaveAttribute('data-layout', 'full')
    await expect(page.getByTestId('sheet-handle')).toHaveCount(0)
    await expect(page.getByTestId('filters')).toBeVisible()
    await page.getByRole('switch', { name: 'Only visible on map' }).uncheck()
    const card = list.getByRole('button', { name: /Dotonbori/ })
    await expect(card).toBeVisible()
    await card.click()

    const panel = page.getByRole('dialog')
    await expect(panel).toBeVisible()
    const panelBox = await panel.boundingBox()
    expect(panelBox?.width).toBeGreaterThan(370)
    expect(panelBox?.height).toBeGreaterThan(700)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(panel).toHaveCount(0)
    await expect(list).toBeVisible()
  },
)

test('T-15-06 a markup title stays literal text in the list, panel, CSV, and PDF', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, '100000000000000002')
  const tripId = await createTrip(page, 'Literal title')
  await createSpot(page, tripId, xss)
  await page.goto(`/trips/${tripId}`)
  await expect(page.getByText(xss, { exact: true })).toBeVisible()
  await expect(page.locator('img[src="x"]')).toHaveCount(0)
  await page
    .getByRole('button', { name: new RegExp(escapeRegExp(xss)) })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Title', exact: true }),
  ).toHaveValue(xss)
  await expect(page.locator('img[src="x"]')).toHaveCount(0)

  const csv = await page.evaluate(async (id) => {
    const response = await fetch(`/api/trips/${id}/export?format=csv`, {
      credentials: 'include',
    })
    if (!response.ok) throw new Error(await response.text())
    return response.text()
  }, tripId)
  expect(csv).toContain(xss)
  expect(csv).not.toContain(`'${xss}`)

  const pdfBase64 = await page.evaluate(async (id) => {
    const response = await fetch(`/api/trips/${id}/export?format=pdf`, {
      credentials: 'include',
    })
    if (!response.ok) throw new Error(await response.text())
    const bytes = new Uint8Array(await response.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  }, tripId)
  expect(pdfPlainText(Buffer.from(pdfBase64, 'base64'))).toContain(xss)
})

test('T-15-10 keyboard creates a spot, adds it to a bucket, and exports CSV', async ({
  page,
}) => {
  // A long Tab walk: about 24 s alone, so it needs room when other specs run.
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockGeocode(page)
  await login(page, '100000000000000002')
  const tripId = await createTrip(page, 'Keyboard trip')
  await page.goto(`/trips/${tripId}`)

  await focusByKeyboard(page, page.getByTestId('add-new'))
  await page.keyboard.press('Enter')
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await focusByKeyboard(page, title)
  await page.keyboard.type('Keyboard shrine')
  const address = page.getByRole('combobox', { name: 'Address' })
  await focusByKeyboard(page, address)
  await page.keyboard.type('fushimi')
  const option = page.getByRole('option', {
    name: 'Fushimi Inari Taisha, Kyoto',
  })
  await expect(option).toBeVisible()
  await focusByKeyboard(page, option)
  await page.keyboard.press('Enter')
  await focusByKeyboard(
    page,
    page.getByRole('button', { name: 'Add', exact: true }),
  )
  await page.keyboard.press('Enter')
  await expect(
    page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Keyboard shrine/ }),
  ).toBeVisible()

  await focusByKeyboard(page, page.getByRole('link', { name: 'Schedule' }))
  await page.keyboard.press('Enter')
  await focusByKeyboard(page, page.getByTestId('add-bucket'))
  await page.keyboard.press('Enter')
  await focusByKeyboard(
    page,
    page.getByRole('textbox', { name: 'Title', exact: true }),
  )
  await page.keyboard.type('Osaka days')
  await focusByKeyboard(page, page.getByLabel('Start date'))
  await page.keyboard.type('04122026')
  await focusByKeyboard(page, page.getByLabel('End date'))
  await page.keyboard.type('04162026')
  await focusByKeyboard(page, page.getByRole('button', { name: 'Save' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Add spot' })).toBeVisible()

  await focusByKeyboard(page, page.getByRole('button', { name: 'Add spot' }))
  await page.keyboard.press('Enter')
  await focusByKeyboard(
    page,
    page.getByRole('option', { name: 'Keyboard shrine' }),
  )
  await page.keyboard.press('Enter')
  await focusByKeyboard(page, page.getByRole('button', { name: 'Add visit' }))
  await page.keyboard.press('Enter')
  await expect(page.getByText('Keyboard shrine').first()).toBeVisible()

  await focusByKeyboard(
    page,
    page.getByRole('link', { name: 'Board', exact: true }),
  )
  await page.keyboard.press('Enter')
  await focusByKeyboard(page, page.getByRole('button', { name: 'Export' }))
  await page.keyboard.press('Enter')
  const downloadPromise = page.waitForEvent('download')
  await focusByKeyboard(page, page.getByRole('link', { name: 'Download' }))
  await page.keyboard.press('Enter')
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(`keyboard-trip-${tokyoDate()}.csv`)
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

function pdfPlainText(pdf: Buffer): string {
  const raw = pdf.toString('latin1')
  const parts: string[] = []
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const chunk = Buffer.from(match[1] ?? '', 'latin1')
    try {
      parts.push(inflateSync(chunk).toString('latin1'))
    } catch {
      parts.push(match[1] ?? '')
    }
  }
  return parts
    .join('\n')
    .replace(/<([0-9a-fA-F]+)>\s*(?:-?\d+\s*)?/g, (_match, hex: string) => {
      let text = ''
      for (let index = 0; index < hex.length; index += 2) {
        text += String.fromCharCode(
          Number.parseInt(hex.slice(index, index + 2), 16),
        )
      }
      return text
    })
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

async function createTrip(page: Page, name: string) {
  return page.evaluate(async (tripName) => {
    const response = await fetch('/api/trips', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: tripName,
        timezone: 'Asia/Tokyo',
        region: {
          bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 },
        },
      }),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = (await response.json()) as { id: string }
    return body.id
  }, name)
}

async function createSpot(page: Page, tripId: string, title: string) {
  await page.evaluate(
    async ({ tripId: id, title: spotTitle }) => {
      const response = await fetch(`/api/trips/${id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: spotTitle,
          lat: 35.01,
          lng: 135.76,
          baseCategory: 'maybe',
          address: 'Kyoto',
        }),
      })
      if (!response.ok) throw new Error(await response.text())
    },
    { tripId, title },
  )
}

async function mockGeocode(page: Page) {
  await page.route('**/api/geocode/search**', (route) =>
    route.fulfill({
      json: {
        results: [
          {
            label: 'Fushimi Inari Taisha, Kyoto',
            lat: 34.9671,
            lng: 135.7727,
          },
        ],
      },
    }),
  )
}
