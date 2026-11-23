import { expectNoSeriousViolations } from './a11y'
import { expect, test } from './fixtures'
import { waitForMap, waitForMapLoaded } from './map'
import {
  aiko,
  fixture,
  japan,
  jumpTo,
  kamoPoint,
  login,
  mapCentre,
  openBook,
  photo,
  photoList,
  photosUrl,
  sameMap,
  setLocale,
  shibuyaSky,
  tagMap,
  tom,
  uploadSpare,
} from './photobook'

const desktop = { width: 1280, height: 800 }

test('T-47-05 the Photobook tab opens on the same map, shows the seed day pages and opens a lightbox; on the phone it is in the More sheet', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize(desktop)
  await login(page, aiko)
  await setLocale(page, 'en')
  await page.goto(`/trips/${japan}`)
  await waitForMapLoaded(page)
  await tagMap(page)

  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Photobook' })
    .click()
  await expect(page).toHaveURL(new RegExp(`/trips/${japan}/photos`))
  await expect(page.getByTestId('photobook')).toBeVisible()
  await expect.poll(() => sameMap(page)).toBe(true)

  // two day pages in date order, then No date
  const day13 = page.getByTestId('book-day-2026-04-13')
  const day18 = page.getByTestId('book-day-2026-04-18')
  await expect(day13).toBeVisible()
  await expect(day18).toBeVisible()
  // Undated photos, the unplaced seed photo included, always have a No date
  // page, whether or not they also wait under Not placed yet.
  const none = page.getByTestId('book-day-none')
  await expect(none).toBeVisible()
  await expect(none.getByTestId(`book-photo-${photo.unplaced}`)).toBeVisible()
  await expect(day13.getByRole('heading', { level: 2 })).toHaveText(
    'Mon 13 Apr',
  )
  await expect(day18.getByRole('heading', { level: 2 })).toHaveText(
    'Sat 18 Apr',
  )
  const order = await page
    .locator('[data-testid^="book-day-"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-testid')),
    )
  const at = (id: string) => order.indexOf(id)
  expect(at('book-day-2026-04-13')).toBeGreaterThanOrEqual(0)
  expect(at('book-day-2026-04-13')).toBeLessThan(at('book-day-2026-04-18'))
  expect(at('book-day-2026-04-18')).toBeLessThan(at('book-day-none'))
  expect(order[order.length - 1]).toBe('book-day-none')

  // the place line shows the linked spot's title
  await expect(
    day13.getByTestId('book-place-line').filter({ hasText: 'Shibuya Sky' }),
  ).toBeVisible()
  await expect(day13.getByTestId(`book-photo-${photo.crossing}`)).toBeVisible()
  await expect(day13.getByTestId(`book-photo-${photo.alley}`)).toBeVisible()
  await expect(day18.getByTestId(`book-photo-${photo.kamo}`)).toBeVisible()

  // a click opens the lightbox with time and place
  await page.getByTestId(`book-photo-${photo.crossing}`).click()
  const lightbox = page.getByTestId('photo-lightbox')
  await expect(lightbox).toBeVisible()
  await expect(lightbox.getByTestId('lightbox-time')).toContainText('10:15')
  await expect(lightbox.getByTestId('lightbox-place')).toContainText(
    'Shibuya Sky',
  )
  await expect(lightbox.getByTestId('lightbox-caption')).toContainText(
    'Crossing from above',
  )
  await page.keyboard.press('Escape')
  await expect(lightbox).toHaveCount(0)
  expect(await sameMap(page)).toBe(true)

  // phone: Photobook is in the More sheet and opens as the book
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`/trips/${japan}`)
  await page
    .getByRole('navigation', { name: 'Trip sections' })
    .getByRole('button', { name: 'More' })
    .click()
  const sheet = page.getByRole('dialog', { name: 'More' })
  const row = sheet.getByTestId('more-photobook')
  await expect(row).toBeVisible()
  await expect(row).toHaveAttribute('href', `/trips/${japan}/photos`)
  await row.click()
  await expect(page).toHaveURL(new RegExp(`/trips/${japan}/photos`))
  await expect(page.getByTestId('photobook')).toBeVisible()
  await expect(page.getByTestId(`book-photo-${photo.crossing}`)).toBeVisible()
  await expect(page.getByTestId('photobook-view-toggle')).toBeVisible()
})

test('T-47-06 the seeded photos are thumbnail markers; a marker highlights its photo, a photo flies the map to its marker, and the board has no markers', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize(desktop)
  await login(page, aiko)
  await setLocale(page, 'en')
  await openBook(page)
  await waitForMap(page)

  // Three seeded markers exist. Close photos may fold into a cluster, so
  // zoom onto each one first when its marker is not drawn yet.
  const seeded = [
    { id: photo.crossing, lng: 139.7022, lat: 35.6582 },
    { id: photo.alley, lng: 139.712, lat: 35.6655 },
    { id: photo.kamo, ...kamoPoint },
  ]
  for (const item of seeded) {
    const marker = page.getByTestId(`photo-marker-${item.id}`)
    if ((await marker.count()) === 0) await jumpTo(page, item.lng, item.lat)
    await expect(marker).toBeVisible()
    await expect(marker.locator('img')).toHaveCount(1)
    await expect(marker).toHaveAttribute('aria-label', /^Photo /)
  }
  // the unplaced seed photo has no marker, unless T-47-09 placed it earlier
  const unplaced = (await photoList(page)).photos.find(
    (item) => item.id === photo.unplaced,
  )
  if (unplaced?.lat === null) {
    await expect(
      page.getByTestId(`photo-marker-${photo.unplaced}`),
    ).toHaveCount(0)
  }

  // a book photo flies the map to its marker
  const before = await mapCentre(page)
  await page.getByTestId(`book-photo-${photo.kamo}`).click()
  await expect(page.getByTestId('photo-lightbox')).toBeVisible()
  await expect
    .poll(async () => {
      const centre = await mapCentre(page)
      return Math.hypot(centre.lng - kamoPoint.lng, centre.lat - kamoPoint.lat)
    })
    .toBeLessThan(0.05)
  expect(before.lng).not.toBeCloseTo(kamoPoint.lng, 1)
  await page.keyboard.press('Escape')

  // a marker highlights its photo and scrolls the book to it
  await jumpTo(page, 139.7022, 35.6582)
  await page.getByTestId(`photo-marker-${photo.crossing}`).click()
  const tile = page.getByTestId(`book-photo-${photo.crossing}`)
  await expect(tile).toHaveAttribute('data-highlighted', 'true')
  await expect(tile).toBeInViewport()
  await expect(
    page.getByTestId(`photo-marker-${photo.crossing}`),
  ).toHaveAttribute('data-highlighted', 'true')
  await page.keyboard.press('Escape')

  // leaving the tab removes the markers
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Board' })
    .click()
  await expect(page).toHaveURL(new RegExp(`/trips/${japan}(\\?.*)?(#.*)?$`))
  await expect(page.locator('[data-testid^="photo-marker-"]')).toHaveCount(0)
  await expect(page.getByTestId('photo-cluster')).toHaveCount(0)
})

test("T-47-11 the linked photo is in the spot gallery, and a caption edit by aiko reaches sven's open lightbox without a reload", async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const planner = await browser.newPage({ viewport: desktop })
  const guest = await browser.newPage({ viewport: desktop })
  try {
    await login(planner, aiko)
    await setLocale(planner, 'en')
    // the seeded photo is linked to Shibuya Sky
    const list = await photoList(planner)
    expect(list.photos.find((item) => item.id === photo.crossing)?.spotId).toBe(
      shibuyaSky,
    )
    await planner.goto(`/trips/${japan}`)
    await planner
      .getByTestId('spot-list')
      .getByRole('button', { name: /Shibuya Sky/ })
      .click()
    await expect(
      planner.getByRole('dialog', { name: 'Edit spot' }),
    ).toBeVisible()
    await expect(
      planner.getByRole('button', { name: 'Photo', exact: true }),
    ).not.toHaveCount(0)

    // two contexts on the book
    await login(guest, '100000000000000001')
    await setLocale(guest, 'en')
    await openBook(guest)
    await openBook(planner)
    await guest.getByTestId(`book-photo-${photo.crossing}`).click()
    await expect(guest.getByTestId('photo-lightbox')).toBeVisible()

    const caption = `Crossing ${Date.now()}`
    await planner.getByTestId(`book-photo-${photo.crossing}`).click()
    const box = planner.getByTestId('photo-lightbox')
    await box.getByTestId('caption-input').fill(caption)
    await box.getByTestId('caption-save').click()
    await expect(
      guest.getByTestId('photo-lightbox').getByTestId('lightbox-caption'),
    ).toContainText(caption, { timeout: 3_000 })

    // restore the seeded caption
    await box.getByTestId('caption-input').fill('Crossing from above')
    await box.getByTestId('caption-save').click()
    await expect(
      guest.getByTestId('photo-lightbox').getByTestId('lightbox-caption'),
    ).toContainText('Crossing from above', { timeout: 3_000 })
  } finally {
    await planner.close()
    await guest.close()
  }
})

test('T-47-09 aiko places the unplaced photo with a map click and drags a marker; tom has no drop zone, no placing controls and no draggable markers', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize(desktop)
  await login(page, aiko)
  await setLocale(page, 'en')

  // The seeded unplaced photo may be placed by an earlier run. Then a fresh
  // photo in the shared trip stands in and is deleted at the end.
  const seeded = (await photoList(page)).photos.find(
    (item) => item.id === photo.unplaced,
  )
  const target =
    seeded && seeded.lat === null && seeded.spotId === null
      ? photo.unplaced
      : await uploadSpare(browser)
  try {
    await openBook(page)
    await waitForMapLoaded(page)
    const notPlaced = page.getByTestId('not-placed')
    await expect(notPlaced).toBeVisible()
    await expect(page.getByTestId(`not-placed-${target}`)).toBeVisible()
    await expect(page.getByTestId(`photo-marker-${target}`)).toHaveCount(0)

    await page.getByTestId(`place-on-map-${target}`).click()
    const hint = page.getByTestId('placing-hint')
    await expect(hint).toBeVisible()
    await expect(hint).toContainText('Click where this photo was taken')
    // Escape cancels
    await page.keyboard.press('Escape')
    await expect(hint).toHaveCount(0)
    await expect(page.getByTestId(`not-placed-${target}`)).toBeVisible()

    // placing by a map click, low on the map where no marker sits
    await page.getByTestId(`place-on-map-${target}`).click()
    await expect(hint).toBeVisible()
    const patch = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        request.url().includes(`/api/images/${target}`),
      { timeout: 15_000 },
    )
    // a free spot on the map: leftovers of earlier runs sit on the shared map
    const free = await page.evaluate(() => {
      const canvas = document.querySelector('canvas.maplibregl-canvas')!
      const rect = canvas.getBoundingClientRect()
      for (let row = 0; row < 20; row += 1) {
        for (let col = 0; col < 20; col += 1) {
          const x =
            rect.left + rect.width * (0.15 + (0.7 * ((col * 7) % 20)) / 20)
          const y =
            rect.top + rect.height * (0.3 + (0.6 * ((row * 11) % 20)) / 20)
          if (y > window.innerHeight - 20 || y < 140) continue
          if (document.elementFromPoint(x, y) === canvas) return { x, y }
        }
      }
      throw new Error('no free map point')
    })
    await page.mouse.click(free.x, free.y)
    const body = JSON.parse((await patch).postData() ?? '{}') as {
      lat: number
      lng: number
    }
    expect(Number.isFinite(body.lat)).toBe(true)
    expect(Number.isFinite(body.lng)).toBe(true)
    await expect(page.getByTestId(`not-placed-${target}`)).toHaveCount(0)
    await expect(hint).toHaveCount(0)
    const marker = page.getByTestId(`photo-marker-${target}`)
    await expect(marker).toBeVisible()
    await expect(marker).toHaveAttribute('data-draggable', 'true')

    // dragging the marker sends a PATCH with the new point
    const moved = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        request.url().includes(`/api/images/${target}`),
      { timeout: 15_000 },
    )
    // the map flies to the placed photo; drag once the marker stands still
    let from = (await marker.boundingBox())!
    for (let tries = 0; tries < 40; tries += 1) {
      await page.waitForTimeout(250)
      const next = (await marker.boundingBox())!
      const still =
        Math.abs(next.x - from.x) < 0.5 && Math.abs(next.y - from.y) < 0.5
      from = next
      if (still) break
    }
    const x = from.x + from.width / 2
    const y = from.y + from.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 30, y + 20, { steps: 8 })
    await page.mouse.move(x + 60, y + 40, { steps: 8 })
    await page.mouse.up()
    const after = JSON.parse((await moved).postData() ?? '{}') as {
      lat: number
      lng: number
    }
    expect(
      Math.abs(after.lat - body.lat) + Math.abs(after.lng - body.lng),
    ).toBeGreaterThan(0)

    // tom (visitor): no drop zone, no placing controls, no drag
    const guest = await browser.newPage({ viewport: desktop })
    try {
      await login(guest, tom)
      await setLocale(guest, 'en')
      await openBook(guest)
      await expect(guest.getByTestId('photo-drop')).toHaveCount(0)
      await expect(guest.getByTestId('photo-file-input')).toHaveCount(0)
      await expect(guest.locator('[data-testid^="place-on-map-"]')).toHaveCount(
        0,
      )
      await expect(guest.locator('[data-testid^="pick-spot-"]')).toHaveCount(0)
      const tomMarker = guest.getByTestId(`photo-marker-${target}`)
      if ((await tomMarker.count()) === 0) {
        const placed = (await photoList(guest)).photos.find(
          (item) => item.id === target,
        )
        await jumpTo(guest, placed?.lng ?? 0, placed?.lat ?? 0)
      }
      await expect(tomMarker).toHaveAttribute('data-draggable', 'false')
    } finally {
      await guest.close()
    }
  } finally {
    // the seeded photo goes back to unplaced only through a new seed; a
    // stand-in photo is removed
    if (target !== photo.unplaced) {
      await page.evaluate(async (id) => {
        await fetch(`/api/images/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
      }, target)
    }
  }
})

test('T-47-10 with low data on, the book requests no image files, markers show the icon and Load all loads the page', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize(desktop)
  await page.addInitScript(() => localStorage.setItem('dataSaver', 'on'))
  const imageRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (/\/images\/[^/]+\/file/.test(url) || url.includes('signature=')) {
      imageRequests.push(url)
    }
  })
  await login(page, aiko)
  await setLocale(page, 'en')
  await page.goto(photosUrl)
  await expect(page.getByTestId('photobook')).toBeVisible()
  const day13 = page.getByTestId('book-day-2026-04-13')
  await expect(day13).toBeVisible()
  await expect(day13.getByTestId('photo-placeholder').first()).toBeVisible()
  await expect(
    day13.getByRole('button', { name: /^Load photo/ }).first(),
  ).toBeVisible()
  // low data asks before it loads the map
  await page.getByRole('button', { name: 'Load map' }).click()
  await waitForMap(page)

  // markers carry the icon, not the thumbnail
  const marker = page.getByTestId(`photo-marker-${photo.crossing}`)
  if ((await marker.count()) === 0) await jumpTo(page, 139.7022, 35.6582)
  await expect(marker).toBeVisible()
  await expect(marker)
    .toHaveAttribute('data-icon', 'true')
    .catch(async () => {
      await expect(marker.locator('[data-icon="true"]')).toHaveCount(1)
    })
  await expect(marker.locator('img')).toHaveCount(0)
  expect(imageRequests).toEqual([])

  // Load all loads the page's photos
  await day13.getByTestId('book-load-all-2026-04-13').click()
  await expect(day13.getByTestId('photo-placeholder')).toHaveCount(0)
  await expect(
    day13.getByTestId(`book-photo-${photo.crossing}`).locator('img'),
  ).toBeVisible()
  expect(imageRequests.length).toBeGreaterThan(0)
  // the other page stays unloaded
  await expect(
    page.getByTestId('book-day-2026-04-18').getByTestId('photo-placeholder'),
  ).not.toHaveCount(0)
})

test('T-47-12 axe finds no serious issues on the book, the upload review and placing mode, in light and dark', async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000)
  await page.setViewportSize(desktop)
  await login(page, aiko)
  await setLocale(page, 'en')
  // a photo without a place, so placing mode can start in any run
  const spare = await uploadSpare(browser)
  try {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await openBook(page)
      await expect(page.getByTestId(`not-placed-${spare}`)).toBeVisible()
      await expectNoSeriousViolations(page, `book ${scheme}`)

      await page
        .getByTestId('photo-file-input')
        .setInputFiles([fixture('gps-shibuya.jpg'), fixture('no-gps.png')])
      await expect(page.getByTestId('upload-review')).toBeVisible()
      await expect(page.getByTestId('upload-item')).toHaveCount(2)
      await expectNoSeriousViolations(page, `upload review ${scheme}`)
      await page.keyboard.press('Escape')
      await page.reload()
      await expect(page.getByTestId('photobook')).toBeVisible()

      await page.getByTestId(`place-on-map-${spare}`).click()
      await expect(page.getByTestId('placing-hint')).toBeVisible()
      await expectNoSeriousViolations(page, `placing mode ${scheme}`)
      await page.keyboard.press('Escape')
    }
  } finally {
    await page.evaluate(async (id) => {
      await fetch(`/api/images/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
    }, spare)
  }
})
