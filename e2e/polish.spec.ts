import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y'
import { expectHover, paint, visual } from './hover'

const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'
const shibuya = '20000000-0000-0000-0000-000000000001'
const sven = '100000000000000001'
const aiko = '100000000000000002'
const tom = '100000000000000003'
const tomId = '00000000-0000-0000-0000-000000000003'

test('T-20-03 hovered controls change and use a pointer', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await setLocale(page, 'en')
  await page.goto('/trips')
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()
  await expectHover(page.getByRole('button', { name: 'New trip' }))
  await expectHover(page.getByRole('link', { name: /Japan 2026/ }).first())
  await expectHover(page.getByRole('link', { name: 'Trip Board' }))

  await page.goto(japanTrip)
  await expect(
    page.getByRole('heading', { name: 'Things to do' }),
  ).toBeVisible()
  await expectHover(page.getByRole('link', { name: 'Schedule' }))
  await expectHover(page.getByRole('button', { name: 'Account menu' }))
  await page.getByRole('button', { name: 'Account menu' }).click()
  await expectHover(page.getByRole('menuitem', { name: 'Log out' }))
  await page.keyboard.press('Escape')
  await expectHover(page.getByRole('button', { name: 'Filter' }))
  await expectHover(page.getByTitle('Sven'))
  await expectHover(page.getByRole('button', { name: 'Zoom in' }))

  await page.getByTestId(`card-${shibuya}`).click()
  const remove = page.getByRole('button', { name: 'Delete spot' })
  await expect(remove).toBeVisible()
  await expectHover(remove)

  await page.goto('/admin/activity')
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await expectHover(page.getByRole('link', { name: 'Users' }))
})

test('T-20-04 a disabled reorder control does not react to hover', async ({
  page,
}) => {
  await login(page, sven)
  await setLocale(page, 'en')
  await page.goto(`${japanTrip}/schedule`)
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible()
  const up = page.locator('[data-testid^="move-up-"][disabled]').first()
  await expect(up).toBeVisible()
  const before = await paint(up)
  await up.hover()
  const after = await paint(up)
  expect(after.cursor).toBe('not-allowed')
  expect(visual(after)).toEqual(visual(before))
})

test('T-20-05 reduced motion makes the hover transition instant', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await login(page, sven)
  await setLocale(page, 'en')
  await page.goto('/trips')
  const button = page.getByRole('button', { name: 'New trip' })
  await button.hover()
  await expect(button).toHaveCSS('transition-duration', '0s')
})

test('T-20-08 link and trip-name errors are red with an alert icon', async ({
  page,
}) => {
  await login(page, sven)
  await setLocale(page, 'en')
  await mockGeocode(page)
  const tripId = await createTrip(page, 'Red errors')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId('add-new').click()
  await page.getByLabel('Title').fill('Temple')
  await page.getByLabel('Address').fill('fushimi')
  await page
    .getByRole('option', { name: 'Fushimi Inari Taisha, Kyoto' })
    .click()
  await page.getByLabel('Link').fill('javascript:x')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const linkError = page.getByTestId('link-error')
  await expect(linkError).toBeVisible()
  await expect(linkError.locator('svg')).toBeVisible()
  expect(await linkError.evaluate((el) => getComputedStyle(el).color)).toBe(
    await token(page, '--danger', 'color'),
  )

  await page.goto('/trips')
  await page.getByRole('button', { name: 'New trip' }).click()
  await page.getByRole('button', { name: 'Create trip' }).click()
  const nameError = page.getByRole('alert').filter({ hasText: 'Enter a name.' })
  await expect(nameError).toBeVisible()
  await expect(nameError.locator('svg')).toBeVisible()
  expect(await nameError.evaluate((el) => getComputedStyle(el).color)).toBe(
    await token(page, '--danger', 'color'),
  )
})

test('T-20-09 an error toast is red and a delete notice stays neutral', async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000)
  await login(page, sven)
  await setLocale(page, 'en')
  const tripId = await createTrip(page, `Toast ${Date.now()}`)
  const code = await invite(page, tripId, 'planner')
  const guest = await browser.newContext()
  const aikoPage = await guest.newPage()
  await login(aikoPage, aiko)
  await setLocale(aikoPage, 'en')
  await aikoPage.evaluate(async (joinCode) => {
    const response = await fetch(`/api/join/${joinCode}`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) throw new Error(await response.text())
  }, code)
  const spotId = await createSpot(page, tripId, 'Shared shrine')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId(`card-${spotId}`).click()
  await page.route('**/api/spots/**', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{}',
      })
    }
    return route.continue()
  })
  await page.getByLabel('Title').fill('Shared shrine edited')
  await page.getByRole('button', { name: 'Save' }).click()
  const errorToast = page.getByTestId('toast')
  await expect(errorToast).toBeVisible()
  await expect(errorToast).toHaveAttribute('data-kind', 'error')
  await expect(errorToast.getByRole('button', { name: 'Close' })).toBeVisible()
  expect(
    await errorToast.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(await token(page, '--danger-solid', 'backgroundColor'))
  await page.waitForTimeout(4500)
  await expect(errorToast).toBeVisible()
  await errorToast.getByRole('button', { name: 'Close' }).click()
  await expect(errorToast).toHaveCount(0)

  await page.unroute('**/api/spots/**')
  await aikoPage.evaluate(async (id) => {
    const response = await fetch(`/api/spots/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!response.ok) throw new Error(await response.text())
  }, spotId)
  const info = page.getByTestId('toast')
  await expect(info).toHaveText('Deleted by Aiko', { timeout: 5000 })
  await expect(info).toHaveAttribute('data-kind', 'info')
  await expect(info.getByRole('button', { name: 'Close' })).toHaveCount(0)
  expect(
    await info.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe(await token(page, '--danger-solid', 'backgroundColor'))
  await guest.close()
})

test('T-20-10 destructive actions use the danger look', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await setLocale(page, 'en')
  await page.goto(japanTrip)
  await page.getByTestId(`card-${shibuya}`).click()
  const deleteSpot = page.getByRole('button', { name: 'Delete spot' })
  await expect(deleteSpot).toBeVisible()
  expect(await deleteSpot.evaluate((el) => getComputedStyle(el).color)).toBe(
    await token(page, '--danger', 'color'),
  )

  await page.goto(`${japanTrip}/settings`)
  await page.getByRole('button', { name: 'Delete trip' }).click()
  const confirm = page.getByRole('button', { name: 'Delete trip' }).last()
  expect(
    await confirm.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(await token(page, '--danger-solid', 'backgroundColor'))

  await page.goto(japanTrip)
  await page.getByRole('button', { name: /^Members/ }).click()
  const remove = page.getByRole('button', { name: 'Remove Aiko' })
  await expect(remove).toBeVisible()
  expect(await remove.evaluate((el) => getComputedStyle(el).color)).toBe(
    await token(page, '--danger', 'color'),
  )
  await page.keyboard.press('Escape')

  await login(page, aiko)
  await setLocale(page, 'en')
  await page.goto(japanTrip)
  await page.getByRole('button', { name: /^Members/ }).click()
  const leave = page.getByRole('button', { name: 'Leave trip' })
  await expect(leave).toBeVisible()
  expect(await leave.evaluate((el) => getComputedStyle(el).color)).toBe(
    await token(page, '--danger', 'color'),
  )
})

test('T-20-11 the header has no trip label and no members text outside a trip', async ({
  page,
}) => {
  await login(page, sven)
  await setLocale(page, 'en')
  for (const path of ['/trips', '/account']) {
    await page.goto(path)
    await expect(page.getByTestId('trip-switcher')).toHaveCount(0)
    await expect(
      page.getByRole('banner').getByText('Trip', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('banner').getByText('Reise', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('banner').getByText('Members', { exact: true }),
    ).toHaveCount(0)
  }
  await page.goto(japanTrip)
  await expect(page.getByTestId('trip-switcher')).toHaveCount(0)
  await expect(
    page.getByRole('banner').getByText('Trip', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('banner').getByText('Reise', { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Members/ })).toBeVisible()
})

test('T-20-13 header avatars open the members dialog and name themselves', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await setLocale(page, 'en')
  await page.goto(japanTrip)
  const header = page.getByRole('banner')
  await expect(header.getByTitle('Sven')).toBeVisible()
  await expect(header.getByTitle('Aiko')).toBeVisible()
  await expect(header.getByTitle('Tom')).toBeVisible()
  await header.getByTitle('Aiko').hover()
  await expect(header.getByTitle('Aiko')).toHaveAttribute('title', 'Aiko')
  await header.getByRole('button', { name: /^Members/ }).click()
  await expect(page.getByRole('dialog', { name: 'Members' })).toBeVisible()
})

test('T-20-14 a removed member disappears from the other header', async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000)
  await login(page, sven)
  await setLocale(page, 'en')
  const tripId = await createTrip(page, `Members ${Date.now()}`)
  const aikoCode = await invite(page, tripId, 'planner')
  const tomCode = await invite(page, tripId, 'visitor')
  const aikoContext = await browser.newContext()
  const tomContext = await browser.newContext()
  const aikoPage = await aikoContext.newPage()
  const tomPage = await tomContext.newPage()
  await login(aikoPage, aiko)
  await login(tomPage, tom)
  await join(aikoPage, aikoCode)
  await join(tomPage, tomCode)
  const events = aikoPage.waitForResponse(
    (response) => response.url().includes('/events') && response.ok(),
  )
  await aikoPage.goto(`/trips/${tripId}`)
  await events
  await expect(
    aikoPage.getByRole('heading', { name: 'Things to do' }),
  ).toBeVisible()
  await expect(aikoPage.getByRole('banner').getByTitle('Tom')).toBeVisible()
  await page.evaluate(
    async ({ tripId: id, userId }) => {
      const response = await fetch(`/api/trips/${id}/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error(await response.text())
    },
    { tripId, userId: tomId },
  )
  await expect(aikoPage.getByRole('banner').getByTitle('Tom')).toHaveCount(0, {
    timeout: 2000,
  })
  await aikoContext.close()
  await tomContext.close()
})

test('T-20-15 the board header does not overflow on a phone or tablet', async ({
  page,
}) => {
  await login(page, sven)
  await setLocale(page, 'en')
  await page.goto(japanTrip)
  await expect(
    page.getByRole('heading', { name: 'Things to do' }),
  ).toBeVisible()
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 800 })
    await expect
      .poll(() =>
        page.evaluate(() => {
          const header = document.querySelector('header')
          if (!header) return true
          return (
            header.scrollWidth > header.clientWidth + 1 ||
            document.documentElement.scrollWidth >
              document.documentElement.clientWidth + 1
          )
        }),
      )
      .toBe(false)
    const image = await page.screenshot()
    await test.info().attach(`header-${width}`, {
      body: image,
      contentType: 'image/png',
    })
  }
})

test('T-20-16 main flows with errors stay accessible in both themes', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await setLocale(page, 'en')
  await page.getByRole('button', { name: 'Light' }).click()

  await page.goto('/trips')
  await expectNoSeriousViolations(page)
  await page.getByRole('button', { name: 'New trip' }).click()
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page.getByText('Enter a name.')).toBeVisible()
  await expectNoSeriousViolations(page)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.getByRole('button', { name: 'New trip' }).click()
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page.getByText('Enter a name.')).toBeVisible()
  await expectNoSeriousViolations(page)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Light' }).click()
  await page.goto(japanTrip)
  await expect(
    page.getByRole('heading', { name: 'Things to do' }),
  ).toBeVisible()
  await expectNoSeriousViolations(page)
  await page.getByRole('button', { name: /^Members/ }).click()
  await expect(page.getByRole('dialog', { name: 'Members' })).toBeVisible()
  await expectNoSeriousViolations(page)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Dark' }).click()
  await expectNoSeriousViolations(page)
  await page.getByRole('button', { name: /^Members/ }).click()
  await expect(page.getByRole('dialog', { name: 'Members' })).toBeVisible()
  await expectNoSeriousViolations(page)

  await page.goto(`${japanTrip}/schedule`)
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible()
  await expectNoSeriousViolations(page)
  await page.getByRole('button', { name: 'Light' }).click()
  await expectNoSeriousViolations(page)
})

async function token(
  page: Page,
  name: string,
  property: 'color' | 'backgroundColor',
) {
  return page.evaluate(
    ({ variable, key }) => {
      const probe = document.createElement('span')
      if (key === 'color') probe.style.color = `var(${variable})`
      else probe.style.backgroundColor = `var(${variable})`
      document.body.append(probe)
      const value = getComputedStyle(probe)[key]
      probe.remove()
      return value
    },
    { variable: name, key: property },
  )
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
  return page.evaluate(
    async ({ tripId: id, title: spotTitle }) => {
      const response = await fetch(`/api/trips/${id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: spotTitle,
          lat: 35.68,
          lng: 139.76,
          baseCategory: 'maybe',
          address: 'Tokyo',
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { id: string }
      return body.id
    },
    { tripId, title },
  )
}

async function invite(page: Page, tripId: string, role: 'planner' | 'visitor') {
  return page.evaluate(
    async ({ tripId: id, role: inviteRole }) => {
      const response = await fetch(`/api/trips/${id}/invites`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: inviteRole }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { code: string }
      return body.code
    },
    { tripId, role },
  )
}

async function join(page: Page, code: string) {
  await page.evaluate(async (joinCode) => {
    const response = await fetch(`/api/join/${joinCode}`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) throw new Error(await response.text())
  }, code)
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
