import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures'
import { png } from './low-data'
import {
  sven,
  createTrip,
  deleteTrip,
  fixture,
  jumpTo,
  login,
  photoList,
  setLocale,
} from './photobook'
import { waitForMapLoaded } from './map'

const MiB = 1024 * 1024

// Buffers, because one file below has no path.
const file = (name: string, mimeType: string) => ({
  name,
  mimeType,
  buffer: readFileSync(fixture(name)),
})

test('T-47-08 dropping two photos with GPS and one without shows the review, uploads them, puts two on the map and one in Not placed yet, and skips a file over the limit', async ({
  page,
}) => {
  test.setTimeout(150_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.route('**/api/geocode/reverse**', (route) =>
    route.fulfill({ json: { label: 'Tokyo, Japan', lat: 35.66, lng: 139.7 } }),
  )
  await login(page, sven)
  await setLocale(page, 'en')
  // an own trip, so the counts are exact whatever other specs uploaded
  const tripId = await createTrip(page, `Photobook upload ${Date.now()}`)
  try {
    await page.goto(`/trips/${tripId}/photos`)
    await expect(page.getByTestId('photobook')).toBeVisible()
    await expect(page.getByTestId('photobook-empty')).toBeVisible()
    await waitForMapLoaded(page)

    const rows = page.getByTestId('upload-item')
    // a file over the per-file limit is skipped, the others still go up
    await page.getByTestId('photo-file-input').setInputFiles([
      file('gps-shibuya.jpg', 'image/jpeg'),
      file('gps-kyoto.jpg', 'image/jpeg'),
      file('no-gps.png', 'image/png'),
      {
        name: 'huge.png',
        mimeType: 'image/png',
        buffer: Buffer.concat([
          Buffer.from(png, 'base64'),
          Buffer.alloc(11 * MiB),
        ]),
      },
    ])
    const review = page.getByTestId('upload-review')
    await expect(review).toBeVisible()
    await expect(rows).toHaveCount(4)
    await expect(page.getByTestId('upload-summary')).toContainText(
      '2 with location · 1 without',
    )
    await expect(rows.filter({ hasText: 'huge.png' })).toHaveAttribute(
      'data-status',
      'skipped',
    )
    await expect(rows.filter({ hasText: 'huge.png' })).toContainText(
      'The image is larger than 10 MB.',
    )
    await expect(rows.and(page.locator('[data-status="ready"]'))).toHaveCount(3)

    await page.getByTestId('upload-start').click()
    await expect(
      page.locator('[data-testid="upload-item"][data-status="done"]'),
    ).toHaveCount(3, { timeout: 60_000 })
    await expect(rows.filter({ hasText: 'huge.png' })).toHaveAttribute(
      'data-status',
      'skipped',
    )

    // two photos have a point, one waits in Not placed yet
    const stored = (await photoList(page, tripId)).photos
    expect(stored).toHaveLength(3)
    const placed = stored.filter((item) => item.lat !== null)
    expect(placed).toHaveLength(2)
    const waiting = stored.find((item) => item.lat === null)!
    await expect(page.getByTestId(`not-placed-${waiting.id}`)).toBeVisible()
    for (const item of placed) {
      const marker = page.getByTestId(`photo-marker-${item.id}`)
      if ((await marker.count()) === 0) {
        await jumpTo(page, item.lng ?? 0, item.lat ?? 0)
      }
      await expect(marker).toBeVisible()
    }
    await expect(page.getByTestId(`photo-marker-${waiting.id}`)).toHaveCount(0)
  } finally {
    await deleteTrip(page, tripId)
  }
})
