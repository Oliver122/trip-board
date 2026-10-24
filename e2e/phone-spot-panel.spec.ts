import { expect, test, type Page } from './fixtures'
import { freshUser } from './low-data'
import { waitForMapLoaded } from './map'
import { settle } from './settle'

const longAddress =
  'Fushimi Inari Taisha, 68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto, 612-0882, Japan'

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

async function post<T>(page: Page, path: string, body: unknown): Promise<T> {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(await response.text())
      return (await response.json()) as unknown
    },
    { path, body },
  ) as Promise<T>
}

async function createTrip(page: Page, name: string) {
  const trip = await post<{ id: string }>(page, '/api/trips', {
    name,
    timezone: 'Asia/Tokyo',
    region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
  })
  return trip.id
}

async function createSpot(page: Page, tripId: string, title: string) {
  const spot = await post<{ id: string }>(page, `/api/trips/${tripId}/spots`, {
    title,
    lat: 34.9671,
    lng: 135.7727,
    baseCategory: 'maybe',
    address: longAddress,
  })
  return spot.id
}

async function plan(page: Page, tripId: string, spotId: string) {
  const bucket = await post<{ id: string }>(page, `/api/trips/${tripId}/plan`, {
    type: 'bucket',
    title: 'Kyoto days',
    startDate: '2026-04-10',
    endDate: '2026-04-12',
  })
  await post(page, `/api/plan/${bucket.id}/spots`, {
    spotId,
    visitDate: '2026-04-10',
  })
}

async function deleteTrip(page: Page, tripId: string) {
  await page.evaluate(async (id) => {
    await fetch(`/api/trips/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
  }, tripId)
}

test.describe('spot panel on the phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('T-42-11 category, title row, address, copy and delete', async ({
    page,
  }) => {
    await login(page, freshUser())
    const tripId = await createTrip(page, 'Phone panel')
    try {
      const spotId = await createSpot(page, tripId, 'Fushimi Inari')
      await plan(page, tripId, spotId)
      await page.goto(`/trips/${tripId}?spot=${spotId}`)
      const panel = page.getByRole('dialog')
      await expect(panel).toBeVisible()

      // The choice shows once, in the chips; Planned (1) is in the title row.
      await expect(panel.getByText('Maybe', { exact: true })).toHaveCount(1)
      const badge = panel.getByTestId('planned-badge')
      await expect(badge).toHaveText('Planned (1)')
      const heading = await panel.getByRole('heading').boundingBox()
      const badgeBox = await badge.boundingBox()
      expect(Math.abs(centreY(badgeBox) - centreY(heading))).toBeLessThan(12)
      await expect(panel.getByLabel('Link')).toHaveAttribute(
        'placeholder',
        'https://…',
      )

      // The long address is fully visible.
      const address = panel.getByRole('combobox', { name: 'Address' })
      await expect(address).toHaveValue(longAddress)
      const fits = await address.evaluate((el) => ({
        x: el.scrollWidth <= el.clientWidth,
        y: el.scrollHeight <= el.clientHeight + 1,
      }))
      expect(fits).toEqual({ x: true, y: true })
      const copy = panel.getByRole('button', { name: 'Copy address' })
      await expect(copy).toHaveAttribute('title', 'Copy address')
      await expect(copy).toHaveText('')
      const copyBox = await copy.boundingBox()
      expect(copyBox?.width).toBeGreaterThanOrEqual(44)
      expect(copyBox?.height).toBeGreaterThanOrEqual(44)

      // Delete spot is a labelled button at the end of the sheet, not in the footer.
      const remove = panel.getByRole('button', { name: 'Delete spot' })
      await remove.scrollIntoViewIfNeeded()
      await expect(remove).toHaveText('Delete spot')
      const removeBox = await remove.boundingBox()
      const cancelBox = await panel
        .getByRole('button', { name: 'Cancel', exact: true })
        .boundingBox()
      expect(removeBox!.y + removeBox!.height).toBeLessThanOrEqual(cancelBox!.y)
      expect(
        await panel
          .getByTestId('spot-panel-body')
          .getByTestId('spot-delete')
          .count(),
      ).toBe(1)
      await remove.click()
      await expect(panel.getByTestId('spot-delete-confirm')).toBeVisible()
      await panel.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      const left = await page.evaluate(async (id) => {
        const response = await fetch(`/api/spots/${id}`, {
          credentials: 'include',
        })
        return response.status
      }, spotId)
      expect(left).toBe(404)
    } finally {
      await deleteTrip(page, tripId)
    }
  })

  test('T-42-12 pick on map keeps the draft, and cancel changes nothing', async ({
    page,
  }) => {
    test.slow()
    await login(page, freshUser())
    const tripId = await createTrip(page, 'Phone pick')
    try {
      await createSpot(page, tripId, 'Anchor')
      await page.goto(`/trips/${tripId}`)
      await waitForMapLoaded(page)
      await settle(page)
      await page.getByTestId('add-new').click()
      const panel = page.getByRole('dialog')
      await expect(panel.getByText(/click the map/i)).toHaveCount(0)
      await panel.getByLabel('Title').fill('Picked spot')

      // Cancel: the sheet comes back unchanged and no pin was placed.
      await panel.getByTestId('pick-on-map').click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByTestId('pick-cross')).toBeVisible()
      await page.getByTestId('pick-cancel').click()
      await expect(panel).toBeVisible()
      await expect(panel.getByLabel('Title')).toHaveValue('Picked spot')
      await expect(page.getByTestId('draft-pin')).toHaveCount(0)

      // Use this point: pan, then the pin sits at the new centre.
      await panel.getByTestId('pick-on-map').click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      const canvas = page.locator('.maplibregl-canvas')
      const area = (await canvas.boundingBox())!
      await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2)
      await page.mouse.down()
      await page.mouse.move(
        area.x + area.width / 2 - 70,
        area.y + area.height / 2 + 50,
        { steps: 8 },
      )
      await page.mouse.up()
      await settle(page)
      const centre = await page.evaluate(() => {
        const map = (
          window as unknown as {
            __tripboardMap: { getCenter: () => { lng: number; lat: number } }
          }
        ).__tripboardMap
        return map.getCenter()
      })
      await page.getByTestId('pick-use').click()
      await expect(panel).toBeVisible()
      await expect(panel.getByLabel('Title')).toHaveValue('Picked spot')
      await expect(page.getByTestId('draft-pin')).toBeVisible()
      await expect(
        panel.getByRole('combobox', { name: 'Address' }),
      ).not.toHaveValue('')
      const pin = (await page.getByTestId('draft-pin').boundingBox())!
      expect(
        Math.abs(pin.x + pin.width / 2 - (area.x + area.width / 2)),
      ).toBeLessThan(4)
      expect(
        Math.abs(pin.y + pin.height / 2 - (area.y + area.height / 2)),
      ).toBeLessThan(4)
      expect(centre.lng).toBeGreaterThan(0)
    } finally {
      await deleteTrip(page, tripId)
    }
  })
})

test('T-42-12 at 768 the edit panel leaves 480 px of map and the pin is in it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 })
  await login(page, freshUser())
  const tripId = await createTrip(page, 'Tablet panel')
  try {
    const spotId = await createSpot(page, tripId, 'Fushimi Inari')
    await page.goto(`/trips/${tripId}?spot=${spotId}`)
    await waitForMapLoaded(page)
    const panel = page.getByRole('dialog')
    await expect(panel).toBeVisible()
    await settle(page)
    const box = (await panel.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(480)
    const pin = (await page.getByTestId(`pin-${spotId}`).boundingBox())!
    expect(pin.x + pin.width).toBeLessThanOrEqual(box.x)
    expect(pin.x).toBeGreaterThanOrEqual(0)
  } finally {
    await deleteTrip(page, tripId)
  }
})

function centreY(box: { y: number; height: number } | null) {
  return box ? box.y + box.height / 2 : Number.NaN
}
