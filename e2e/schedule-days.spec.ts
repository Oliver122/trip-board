import { expect, test, type Page } from './fixtures'
import { expectNoSeriousViolations } from './a11y'
import { waitForMapLoaded } from './map'

const sven = '100000000000000001'
const aiko = '100000000000000002'

// Seeded Japan 2026 (R-46-10): trip start 12 Apr, so 13 Apr is day 2.
const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'
const tokyoEntry = '30000000-0000-0000-0000-000000000001'
const nara = '20000000-0000-0000-0000-000000000004'
const ryokan = '20000000-0000-0000-0000-000000000006'
const shibuyaStop = '40000000-0000-0000-0000-000000000001'
const teamLab14 = '40000000-0000-0000-0000-000000000002'
const teamLab13 = '40000000-0000-0000-0000-000000000004'
const hotel13 = '40000000-0000-0000-0000-000000000005'

const day13 = '2026-04-13'
const day14 = '2026-04-14'

// Own trips for every test that moves visits, so the seeded schedule other
// specs read stays untouched.

test('T-46-04 a visit moves to another day, to Any day and back after a failed request', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, aiko)
  await setLocale(page, 'en')
  const tripId = await createTrip(page, `Days move ${Date.now()}`)
  const entryId = await createBucket(page, tripId, 'Tokyo')
  const alpha = await addVisit(page, entryId, tripId, 'Alpha Spot', day13)
  await addVisit(page, entryId, tripId, 'Beta Spot', day13)
  await addVisit(page, entryId, tripId, 'Gamma Spot', day14)
  // An undated visit makes the Any day header exist as a drop target.
  const delta = await addVisit(page, entryId, tripId, 'Delta Spot', null)
  await page.goto(`/trips/${tripId}/schedule`)
  await expect(page.getByTestId(`visit-${alpha}`)).toHaveAttribute(
    'data-day',
    day13,
  )

  // ⋯ → Move to… → the other day
  await page.getByTestId(`row-menu-${alpha}`).click()
  await page.getByTestId(`move-to-${alpha}`).click()
  const dialog = page.getByTestId('move-dialog')
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByTestId(`move-option-${entryId}-${day13}`),
  ).toBeDisabled()
  await dialog.getByTestId(`move-option-${entryId}-${day14}`).click()
  await expect(dialog).toHaveCount(0)
  const moved = page.getByTestId(`day-group-${entryId}-${day14}`)
  const row = moved.getByTestId(`visit-${alpha}`)
  await expect(row).toBeVisible()
  await expect(row).toHaveAttribute('data-day', day14)
  const stop = (await page.getByTestId(`stop-number-${alpha}`).textContent())!
  expect(Number(stop)).toBeGreaterThan(0)
  await expect(page.getByTestId('reorder-live')).toContainText(
    `Moved to Tue 14 Apr, stop ${stop}`,
  )
  await expect(page.getByTestId(`row-menu-${alpha}`)).toBeFocused()
  await expect(moved.getByTestId('stop-number-' + alpha)).toHaveText(stop)

  // the move is stored
  await page.reload()
  await expect(
    page
      .getByTestId(`day-group-${entryId}-${day14}`)
      .getByTestId(`visit-${alpha}`),
  ).toBeVisible()

  // drag onto Any day clears the date
  await page
    .getByTestId(`drag-${alpha}`)
    .dragTo(page.getByTestId(`day-header-${entryId}-any`))
  const undated = page.getByTestId(`day-group-${entryId}-any`)
  await expect(undated.getByTestId(`visit-${alpha}`)).toHaveAttribute(
    'data-day',
    'any',
  )
  await expect(page.getByTestId(`stop-number-${alpha}`)).toHaveCount(0)

  // a failed request restores the old place and shows the error toast
  await page.route('**/api/plan/*/spots/*', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"error":"boom"}',
        })
      : route.continue(),
  )
  await page.getByTestId(`row-menu-${delta}`).click()
  await page.getByTestId(`move-to-${delta}`).click()
  await page
    .getByTestId('move-dialog')
    .getByTestId(`move-option-${entryId}-${day13}`)
    .click()
  await expect(page.getByTestId('toast')).toContainText(
    'The visit could not be moved.',
  )
  await expect(
    page.getByTestId(`day-group-${entryId}-any`).getByTestId(`visit-${delta}`),
  ).toHaveAttribute('data-day', 'any')
  await expect(page.getByTestId(`stop-number-${delta}`)).toHaveCount(0)
})

test('T-46-05 the seeded plan is drawn as numbered day pins and lines, and only on the Schedule tab', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, aiko)
  await setLocale(page, 'en')
  await page.goto(`${japanTrip}/schedule`)
  await waitForMapLoaded(page)

  const expected = [
    { link: teamLab13, day: day13, stop: '1', token: '--day-2' },
    { link: shibuyaStop, day: day13, stop: '2', token: '--day-2' },
    { link: hotel13, day: day13, stop: '3', token: '--day-2' },
    { link: teamLab14, day: day14, stop: '1', token: '--day-3' },
  ]
  for (const { link, day, stop, token } of expected) {
    const pin = page.getByTestId(`plan-pin-${link}`)
    await expect(pin).toBeVisible()
    await expect(pin).toHaveAttribute('data-day', day)
    await expect(pin).toHaveAttribute('data-stop', stop)
    await expect(pin).toHaveText(stop)
    const colour = await dayTokenColour(page, token)
    await expect(pin).toHaveCSS('background-color', colour)
  }

  const lines = await planLineLayers(page)
  expect(lines).toContain(`plan-line-${day13}`)
  expect(lines).toContain(`plan-line-${day14}`)
  expect(new Set(lines).size).toBe(lines.length)

  // spots without a dated visit stay as dimmed normal pins
  for (const spotId of [nara, ryokan]) {
    // data-undated and the opacity sit on the marker element around the pin
    const pin = page
      .locator('.maplibregl-marker')
      .filter({ has: page.getByTestId(`pin-${spotId}`) })
    await expect(pin).toHaveAttribute('data-undated', 'true')
    await expect(pin).toHaveCSS('opacity', '0.4')
  }

  // a numbered pin selects its row
  // dispatched: neighbouring pins and day cards can cover its centre
  await page
    .getByRole('button', { name: 'Mon 13 Apr, stop 2: Shibuya Sky' })
    .dispatchEvent('click')
  await expect(page.getByTestId(`visit-${shibuyaStop}`)).toHaveAttribute(
    'data-selected',
    'true',
  )

  // the board has its normal pins and no plan layers
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'Board', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`${japanTrip}(\\?|#|$)`))
  await expect(page.getByTestId(`pin-${nara}`)).toBeVisible()
  await expect(page.locator('[data-testid^="plan-pin-"]')).toHaveCount(0)
  await expect.poll(() => planLineLayers(page)).toEqual([])
})

test('T-46-06 day cards sit apart, focus a day on click, hide with the switch and are absent below 1024 px', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, aiko)
  await setLocale(page, 'en')
  await page.goto(`${japanTrip}/schedule`)
  await waitForMapLoaded(page)
  await page.evaluate(() => {
    try {
      localStorage.removeItem('scheduleDayCards')
    } catch {
      // storage can be blocked
    }
  })
  await page.reload()
  await waitForMapLoaded(page)
  try {
    await page.getByTestId(`entry-${tokyoEntry}`).click()
    const first = page.getByTestId(`day-card-${day13}`)
    const second = page.getByTestId(`day-card-${day14}`)
    await expect(first).toBeVisible()
    await expect(second).toBeVisible()
    await expect(first).toContainText('Mon 13 Apr · 3 stops')
    await expect(second).toContainText('Tue 14 Apr · 1 stop')
    const a = (await first.boundingBox())!
    const b = (await second.boundingBox())!
    const apart =
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y
    expect(apart).toBe(true)
    await attach(page, testInfo, 'schedule-1280-map-cards')

    // clicking a card fits the map to that day and fades the other one
    await first.click()
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await expect(second).toHaveCSS('opacity', '0.3')
    await expect
      .poll(() => pinsInsideMap(page, [teamLab13, shibuyaStop, hotel13]))
      .toBe(true)
    // Escape ends the focus
    await page.keyboard.press('Escape')
    await expect(second).toHaveCSS('opacity', '1')
    await expect(first).toHaveAttribute('aria-pressed', 'false')

    // the switch hides the cards, also after a reload
    const toggle = page.getByTestId('day-cards-switch')
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(page.locator('[data-testid^="day-card-"]')).toHaveCount(0)
    await page.reload()
    await waitForMapLoaded(page)
    await expect(page.getByTestId('day-cards-switch')).toBeVisible()
    await expect(page.locator('[data-testid^="day-card-"]')).toHaveCount(0)
    await page.getByTestId('day-cards-switch').click()
    await expect(page.getByTestId(`day-card-${day13}`)).toBeVisible()

    // below 1024 px there are no cards and no switch
    await page.setViewportSize({ width: 768, height: 1024 })
    await expect(page.getByTestId(`plan-pin-${teamLab13}`)).toBeVisible()
    await expect(page.locator('[data-testid^="day-card-"]')).toHaveCount(0)
    await expect(page.getByTestId('day-cards-switch')).toHaveCount(0)
    await attach(page, testInfo, 'schedule-768-map')
  } finally {
    await page
      .evaluate(() => {
        try {
          localStorage.removeItem('scheduleDayCards')
        } catch {
          // storage can be blocked
        }
      })
      .catch(() => undefined)
  }
})

test('T-46-08 a plan without visit dates shows the hint and a move by another member redraws the pins in place', async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, aiko)
  await setLocale(page, 'en')
  const tripId = await createTrip(page, `Days live ${Date.now()}`)
  const entryId = await createBucket(page, tripId, 'Tokyo')
  const first = await addVisit(page, entryId, tripId, 'Alpha Spot', null)

  // no visit has a date: a hint, no numbered pins
  await page.goto(`/trips/${tripId}/schedule`)
  await waitForMapLoaded(page)
  await expect(page.getByTestId('plan-hint')).toBeVisible()
  await expect(page.locator('[data-testid^="plan-pin-"]')).toHaveCount(0)

  // dated visits: the hint goes away
  await patchVisit(page, entryId, first, { visitDate: day13 })
  const second = await addVisit(page, entryId, tripId, 'Beta Spot', day13)
  const third = await addVisit(page, entryId, tripId, 'Gamma Spot', day14)
  await expect(page.getByTestId('plan-hint')).toHaveCount(0)
  await expect(page.getByTestId(`plan-pin-${third}`)).toBeVisible()

  // a second member with an open schedule
  const context = await browser.newContext()
  try {
    const guest = await context.newPage()
    await guest.setViewportSize({ width: 1280, height: 800 })
    await login(guest, sven)
    await setLocale(guest, 'en')
    await join(page, guest, tripId)
    await guest.goto(`/trips/${tripId}/schedule`)
    await waitForMapLoaded(guest)
    await expect(guest.getByTestId(`plan-pin-${first}`)).toHaveAttribute(
      'data-day',
      day13,
    )
    await expect(guest.getByTestId(`plan-pin-${second}`)).toHaveAttribute(
      'data-stop',
      '2',
    )
    await guest.waitForTimeout(1_000)
    const before = await mapCentre(guest)

    // aiko moves the first visit to the other day
    await patchVisit(page, entryId, first, {
      planEntryId: entryId,
      visitDate: day14,
    })
    await expect(guest.getByTestId(`plan-pin-${first}`)).toHaveAttribute(
      'data-day',
      day14,
      { timeout: 3_000 },
    )
    await expect(guest.getByTestId(`plan-pin-${second}`)).toHaveAttribute(
      'data-stop',
      '1',
      { timeout: 3_000 },
    )
    const after = await mapCentre(guest)
    expect(after.lng).toBeCloseTo(before.lng, 4)
    expect(after.lat).toBeCloseTo(before.lat, 4)
  } finally {
    await context.close()
  }
})

for (const theme of ['Light', 'Dark'] as const) {
  test(`T-46-09 axe finds no serious issues on the schedule with days, the move dialog and day cards in ${theme} mode`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await login(page, aiko)
    await setLocale(page, 'en')
    await page.goto(`${japanTrip}/schedule`)
    await page.getByRole('button', { name: theme, exact: true }).click()
    await waitForMapLoaded(page)
    await page.getByTestId(`entry-${tokyoEntry}`).click()
    await expect(
      page.getByTestId(`day-group-${tokyoEntry}-${day13}`),
    ).toBeVisible()
    await expect(page.getByTestId(`day-card-${day13}`)).toBeVisible()
    await expectNoSeriousViolations(page, `${theme} schedule with day cards`)

    await page.getByTestId(`row-menu-${shibuyaStop}`).click()
    await page.getByTestId(`move-to-${shibuyaStop}`).click()
    await expect(page.getByTestId('move-dialog')).toBeVisible()
    await expectNoSeriousViolations(page, {
      label: `${theme} move dialog`,
    })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('move-dialog')).toHaveCount(0)
    await attach(page, testInfo, `schedule-1280-${theme.toLowerCase()}`)
  })
}

async function attach(
  page: Page,
  testInfo: { attach: (name: string, options: object) => Promise<void> },
  name: string,
) {
  const body = await page.screenshot()
  await testInfo.attach(name, { body, contentType: 'image/png' })
}

async function dayTokenColour(page: Page, token: string) {
  return page.evaluate((name) => {
    const probe = document.createElement('div')
    probe.style.background = `var(${name})`
    document.body.append(probe)
    const colour = getComputedStyle(probe).backgroundColor
    probe.remove()
    return colour
  }, token)
}

function planLineLayers(page: Page) {
  return page.evaluate(() => {
    const map = (
      window as unknown as {
        __tripboardMap?: { getStyle: () => { layers?: { id: string }[] } }
      }
    ).__tripboardMap
    return (map?.getStyle().layers ?? [])
      .map((layer) => layer.id)
      .filter((id) => id.startsWith('plan-line-'))
  })
}

// Every given plan pin lies inside the map canvas box.
async function pinsInsideMap(page: Page, links: string[]) {
  const canvas = await page.locator('.maplibregl-canvas').first().boundingBox()
  if (!canvas) return false
  for (const link of links) {
    const box = await page.getByTestId(`plan-pin-${link}`).boundingBox()
    if (!box) return false
    if (
      box.x < canvas.x ||
      box.y < canvas.y ||
      box.x + box.width > canvas.x + canvas.width ||
      box.y + box.height > canvas.y + canvas.height
    ) {
      return false
    }
  }
  return true
}

function mapCentre(page: Page) {
  return page.evaluate(() => {
    const map = (
      window as unknown as {
        __tripboardMap?: { getCenter: () => { lng: number; lat: number } }
      }
    ).__tripboardMap
    const center = map?.getCenter()
    return { lng: center?.lng ?? 0, lat: center?.lat ?? 0 }
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

async function createBucket(page: Page, tripId: string, title: string) {
  return page.evaluate(
    async ({ tripId: id, title: entryTitle }) => {
      const response = await fetch(`/api/trips/${id}/plan`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'bucket',
          title: entryTitle,
          startDate: '2026-04-12',
          endDate: '2026-04-16',
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { id: string }
      return body.id
    },
    { tripId, title },
  )
}

// Creates a spot near Tokyo and adds it to the entry; returns the link id.
let spotCount = 0
async function addVisit(
  page: Page,
  entryId: string,
  tripId: string,
  title: string,
  visitDate: string | null,
) {
  spotCount += 1
  const offset = spotCount * 0.01
  return page.evaluate(
    async ({
      entryId: entry,
      tripId: trip,
      title: name,
      visitDate: date,
      offset: shift,
    }) => {
      const post = async (path: string, body: unknown) => {
        const response = await fetch(path, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!response.ok) throw new Error(await response.text())
        return (await response.json()) as { id: string }
      }
      const spot = await post(`/api/trips/${trip}/spots`, {
        title: name,
        lat: 35.65 + shift,
        lng: 139.7 + shift,
        baseCategory: 'maybe',
        address: 'Tokyo',
      })
      const link = await post(`/api/plan/${entry}/spots`, {
        spotId: spot.id,
        ...(date ? { visitDate: date } : {}),
      })
      return link.id
    },
    { entryId, tripId, title, visitDate, offset },
  )
}

async function patchVisit(
  page: Page,
  entryId: string,
  linkId: string,
  body: { planEntryId?: string; visitDate?: string | null },
) {
  await page.evaluate(
    async ({ entryId: entry, linkId: link, body: payload }) => {
      const response = await fetch(`/api/plan/${entry}/spots/${link}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await response.text())
    },
    { entryId, linkId, body },
  )
}

async function join(owner: Page, guest: Page, tripId: string) {
  const code = await owner.evaluate(async (id) => {
    const response = await fetch(`/api/trips/${id}/invites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'planner' }),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = (await response.json()) as { code: string }
    return body.code
  }, tripId)
  await guest.evaluate(async (invite) => {
    const response = await fetch(`/api/join/${encodeURIComponent(invite)}`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) throw new Error(await response.text())
  }, code)
}
