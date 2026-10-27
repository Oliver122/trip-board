import { randomBytes } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import { expect, test, type Locator, type Page } from './fixtures'
import { showLocale } from './locale'
import { waitForMap } from './map'

const sven = '100000000000000001'
const aiko = '100000000000000002'
const tom = '100000000000000003'
const aikoId = '00000000-0000-0000-0000-000000000002'
const tomId = '00000000-0000-0000-0000-000000000003'
const MiB = 1024 * 1024

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// The tests change aiko's limits and the platform default, so they run one
// after the other.
test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.route('**/api/geocode/search**', (route) =>
    route.fulfill({
      json: {
        results: [
          {
            label: 'Kinkaku-ji, Kita Ward, Kyoto',
            lat: 35.0394,
            lng: 135.7292,
          },
        ],
      },
    }),
  )
  await page.route('**/api/geocode/reverse**', (route) =>
    route.fulfill({ json: { label: 'Kyoto, Japan', lat: 35, lng: 135.75 } }),
  )
})

// T-43-11
test('T-43-11 a gallery drop skips the file over the limit and adds the other', async ({
  page,
}) => {
  const uploads: string[] = []
  await page.route('**/api/spots/*/images', (route) => {
    if (route.request().method() === 'POST') uploads.push('post')
    return route.continue()
  })
  await login(page, tom)
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Size limit gallery')
  try {
    await createSpot(page, tripId, 'Temple')
    await page.goto(`/trips/${tripId}`)
    await page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Temple/ })
      .click()
    await expect(page.getByTestId('quota-counter')).toBeVisible()

    await dropFiles(page, 'image-drop', [
      { name: 'big.png', size: 11 * MiB },
      { name: 'small.png', size: png.length },
    ])
    await expect(
      page.getByText('The image is larger than 10 MB.'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Photo', exact: true }),
    ).toHaveCount(1)
    expect(uploads).toHaveLength(1)
  } finally {
    await deleteTrip(page, tripId)
  }
})

// T-43-11
test('T-43-11 add mode keeps the file over the limit out of the queue', async ({
  page,
}) => {
  await showLocale(page, 'de')
  await login(page, tom)
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Size limit queue')
  try {
    await page.goto(`/trips/${tripId}`)
    await waitForMap(page)
    await page.getByTestId('add-new').click()
    await page.getByRole('combobox').first().fill('kinkaku')
    await page.getByRole('option', { name: /Kinkaku-ji/ }).click()
    await expect(page.getByTestId('draft-photos')).toBeVisible()

    await dropFiles(page, 'draft-image-drop', [
      { name: 'big.png', size: 11 * MiB },
      { name: 'small.png', size: png.length },
    ])
    await expect(
      page
        .getByTestId('draft-photos')
        .getByText('Das Bild ist größer als 10 MB.'),
    ).toBeVisible()
    await expect(
      page.getByTestId('queued-photos').getByRole('img'),
    ).toHaveCount(1)
    await expect(
      page.getByTestId('queued-photos').getByRole('img'),
    ).toHaveAttribute('alt', 'small.png')
  } finally {
    await deleteTrip(page, tripId)
  }
})

test.describe('Per-user file size limit admin fields', () => {
  test.describe.configure({ mode: 'serial' })

  let tripId: string | null = null

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    try {
      await loginEnglish(page, aiko)
      if (tripId) {
        await page.evaluate(async (id) => {
          await fetch(`/api/trips/${id}`, {
            method: 'DELETE',
            credentials: 'include',
          })
        }, tripId)
      }
      await loginEnglish(page, sven)
      await page.evaluate(
        async ({ userId, bytes }) => {
          const headers = { 'content-type': 'application/json' }
          await fetch(`/api/admin/users/${userId}/quota`, {
            method: 'PATCH',
            credentials: 'include',
            headers,
            body: JSON.stringify({ reset: true }),
          })
          await fetch('/api/admin/settings', {
            method: 'PATCH',
            credentials: 'include',
            headers,
            body: JSON.stringify({ defaultMaxFileBytes: bytes }),
          })
        },
        { userId: aikoId, bytes: 10 * MiB },
      )
    } finally {
      await page.close()
    }
  })

  test('T-43-12 an admin sets the max file size per user and as default, and the limit applies', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginEnglish(page, sven)
    await page.goto('/admin/users')
    await page
      .getByRole('textbox', { name: 'Search by name or Discord id' })
      .fill('Aiko')
    await page.getByRole('link', { name: 'Aiko', exact: true }).click()
    await expect(page.getByTestId('file-limit')).toHaveText(
      'Max file size 10 MB · default',
    )

    await page.getByRole('button', { name: 'Extend storage' }).click()
    const dialog = page.getByRole('dialog', { name: 'Extend storage' })
    const field = dialog.getByRole('spinbutton', { name: 'Max file size (MB)' })
    await expect(field).toHaveValue('10')
    await field.fill('60')
    await expect(dialog.getByText('Between 1 and 50 MB')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()
    await field.fill('20')
    await raiseImages(dialog)
    await dialog.getByRole('textbox', { name: 'Reason' }).fill('big raws')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('file-limit')).toHaveText(
      'Max file size 20 MB · override',
    )
    await page.getByRole('link', { name: 'Audit log' }).click()
    await expect(
      page.getByRole('cell', { name: 'big raws' }).first(),
    ).toBeVisible()
    await expect(
      page.getByRole('cell', { name: 'user.quota_update' }).first(),
    ).toBeVisible()

    // The default applies to users without an override.
    await page.goto('/admin/settings')
    const defaultField = page.getByRole('spinbutton', {
      name: 'Default max file size (MB)',
    })
    await defaultField.fill('12')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toContainText('Saved')
    await page.goto(`/admin/users/${tomId}`)
    await expect(page.getByTestId('file-limit')).toHaveText(
      'Max file size 12 MB · default',
    )

    // Reset to default also drops the file size override.
    await page.goto(`/admin/users/${aikoId}`)
    await page.getByRole('button', { name: 'Extend storage' }).click()
    const again = page.getByRole('dialog', { name: 'Extend storage' })
    await again.getByRole('checkbox', { name: 'Reset to default' }).check()
    await again.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('file-limit')).toHaveText(
      'Max file size 12 MB · default',
    )
    await page.getByRole('button', { name: 'Extend storage' }).click()
    await page
      .getByRole('dialog', { name: 'Extend storage' })
      .getByRole('spinbutton', { name: 'Max file size (MB)' })
      .fill('20')
    await raiseImages(page.getByRole('dialog', { name: 'Extend storage' }))
    await page
      .getByRole('dialog', { name: 'Extend storage' })
      .getByRole('button', { name: 'Save' })
      .click()
    await expect(page.getByTestId('file-limit')).toHaveText(
      'Max file size 20 MB · override',
    )

    // aiko (20 MB override) drops an image above the 10 MiB default.
    await loginEnglish(page, aiko)
    tripId = await createTripWithSpot(page)
    await page.goto(`/trips/${tripId}`)
    await page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Temple/ })
      .click()
    const spot = page.getByRole('dialog', { name: 'Edit spot' })
    await expect(spot).toBeVisible()
    await expect(page.getByTestId('quota-counter')).toBeVisible()
    await page.getByTestId('image-drop').locator('input').setInputFiles({
      name: 'eleven.png',
      mimeType: 'image/png',
      buffer: bigPng(),
    })
    await expect(
      page.getByRole('button', { name: 'Photo', exact: true }),
    ).toHaveCount(1, { timeout: 60_000 })
  })
})

// Aiko's dev data may already sit at the image limit: leave room for the drop.
async function raiseImages(dialog: Locator) {
  const images = dialog.getByRole('spinbutton', { name: 'Images' })
  await images.fill(String(Number(await images.inputValue()) + 10))
}

/** A valid PNG of about 11 MB: random pixels do not compress. */
function bigPng(): Buffer {
  const width = 2000
  const height = 1850
  const row = width * 3 + 1
  const raw = Buffer.alloc(row * height)
  for (let y = 0; y < height; y += 1) {
    randomBytes(width * 3).copy(raw, y * row + 1)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 0 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  expect(png.length).toBeGreaterThan(10 * MiB)
  expect(png.length).toBeLessThan(12 * 1024 * 1024)
  return png
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

async function createTripWithSpot(page: Page) {
  return page.evaluate(async () => {
    const post = async (url: string, body: unknown) => {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(await response.text())
      return (await response.json()) as { id: string }
    }
    const trip = await post('/api/trips', {
      name: 'File size limit',
      timezone: 'Asia/Tokyo',
      region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
    })
    await post(`/api/trips/${trip.id}/spots`, {
      title: 'Temple',
      lat: 35.01,
      lng: 135.76,
      baseCategory: 'maybe',
      address: 'Kyoto',
    })
    return trip.id
  })
}

async function loginEnglish(page: Page, discordId: string) {
  await page.goto('/login')
  await page.evaluate(async (id) => {
    const response = await fetch('/api/test/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ discordId: id }),
    })
    if (!response.ok) throw new Error(await response.text())
    await fetch('/api/me', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'en' }),
    })
  }, discordId)
}

async function dropFiles(
  page: Page,
  testId: string,
  files: { name: string; size: number }[],
) {
  await page.evaluate(
    ({ id, entries, pngBase64 }) => {
      const zone = document.querySelector(`[data-testid="${id}"]`)
      if (!(zone instanceof HTMLElement)) throw new Error('missing drop zone')
      const base = Uint8Array.from(atob(pngBase64), (char) =>
        char.charCodeAt(0),
      )
      const transfer = new DataTransfer()
      for (const entry of entries) {
        const bytes = new Uint8Array(Math.max(entry.size, base.length))
        bytes.set(base)
        transfer.items.add(new File([bytes], entry.name, { type: 'image/png' }))
      }
      zone.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      )
    },
    { id: testId, entries: files, pngBase64: png.toString('base64') },
  )
}

async function deleteTrip(page: Page, tripId: string) {
  await page.evaluate(async (id) => {
    await fetch(`/api/trips/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
  }, tripId)
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
