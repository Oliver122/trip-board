import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y'
import { settle } from './settle'

const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'

test('T-15-09 axe finds no serious issues on the main pages in both themes', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/login')
  await expectNoSeriousViolations(page, 'light')
  await page.getByRole('button', { name: 'Dark' }).click()
  await expectNoSeriousViolations(page, 'dark')

  await login(page, '100000000000000001')
  await page.getByRole('button', { name: 'Light' }).click()

  await page.goto('/trips')
  await expectNoSeriousViolations(page, 'light')
  await page.getByRole('button', { name: 'Dark' }).click()
  await expectNoSeriousViolations(page, 'dark')
  await page.getByRole('button', { name: 'Light' }).click()

  await page.goto(japanTrip)
  await expect(
    page.getByRole('heading', { name: 'Things to do' }),
  ).toBeVisible()
  await expectNoSeriousViolations(page, 'light')
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Shibuya Sky/ })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoSeriousViolations(page, 'light')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Dark' }).click()
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: /Shibuya Sky/ })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoSeriousViolations(page, 'dark')
  await page.keyboard.press('Escape')

  await page.goto(`${japanTrip}/schedule`)
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible()
  await expectNoSeriousViolations(page, 'dark')
  await page.getByRole('button', { name: 'Light' }).click()
  await expectNoSeriousViolations(page, 'light')

  await page.goto(japanTrip)
  await page.getByRole('button', { name: 'Members' }).click()
  await expect(page.getByRole('dialog', { name: 'Members' })).toBeVisible()
  await expectNoSeriousViolations(page, 'light')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.getByRole('button', { name: 'Members' }).click()
  await expect(page.getByRole('dialog', { name: 'Members' })).toBeVisible()
  await expectNoSeriousViolations(page, 'dark')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Light' }).click()
  await page.getByRole('button', { name: 'Export' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoSeriousViolations(page, 'light')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.getByRole('button', { name: 'Export' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoSeriousViolations(page, 'dark')
  await page.keyboard.press('Escape')

  const code = await page.evaluate(async () => {
    const response = await fetch(
      '/api/trips/10000000-0000-0000-0000-000000000001/invites',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'visitor' }),
      },
    )
    if (!response.ok) throw new Error(await response.text())
    const body = (await response.json()) as { code: string }
    return body.code
  })
  await page.goto(`/join/${code}`)
  await expect(page.getByRole('button', { name: 'Join trip' })).toBeVisible()
  await expectNoSeriousViolations(page, 'dark')
  await page.getByRole('button', { name: 'Light' }).click()
  await expectNoSeriousViolations(page, 'light')

  await page.goto('/account')
  await expect(
    page.getByRole('heading', { name: 'Account & settings' }),
  ).toBeVisible()
  await expectNoSeriousViolations(page, 'light')
  await page.getByRole('banner').getByRole('button', { name: 'Dark' }).click()
  await expectNoSeriousViolations(page, 'dark')
})

test('T-31-11 axe finds no serious issues with the delete confirmations open in both themes', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, '100000000000000001')
  const tripId = await page.evaluate(async () => {
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
    const trip = await post('/api/trips', {
      name: `Delete a11y ${Date.now().toString(36)}`,
      timezone: 'Asia/Tokyo',
      region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
    })
    const spot = await post(`/api/trips/${trip.id}/spots`, {
      title: 'Axe spot',
      lat: 35.01,
      lng: 135.76,
      baseCategory: 'maybe',
      address: 'Kyoto',
    })
    await post(`/api/spots/${spot.id}/comments`, { body: 'A comment' })
    await post(`/api/trips/${trip.id}/plan`, {
      type: 'bucket',
      title: 'Axe bucket',
      startDate: '2026-04-12',
      endDate: '2026-04-16',
    })
    return trip.id
  })

  for (const theme of ['Dark', 'Light'] as const) {
    await page.goto(`/trips/${tripId}`)
    await page.getByRole('button', { name: theme }).click()
    await page
      .getByTestId('spot-list')
      .getByRole('button', { name: /Axe spot/ })
      .click()
    const panel = page.getByRole('dialog')
    await expect(panel).toBeVisible()
    await expectNoSeriousViolations(page, `${theme} spot panel`)
    await panel.getByRole('button', { name: 'Delete spot' }).click()
    await expect(page.getByTestId('spot-delete-confirm')).toBeVisible()
    await expectNoSeriousViolations(page, `${theme} spot confirming`)
    await page.keyboard.press('Escape')

    await page.goto(`/trips/${tripId}/schedule`)
    await page.getByRole('button', { name: 'Edit Axe bucket' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expectNoSeriousViolations(page, `${theme} entry dialog`)
    await dialog.getByRole('button', { name: 'Delete entry' }).click()
    await expect(page.getByTestId('entry-delete-confirm')).toBeVisible()
    await expectNoSeriousViolations(page, `${theme} entry confirming`)
    await page.keyboard.press('Escape')
  }
})

// T-42-19: the phone pages of step 42 in both themes
for (const scheme of ['light', 'dark'] as const) {
  test(`T-42-19 axe finds no serious issues on the 390 px pages in ${scheme} mode`, async ({
    page,
  }) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: scheme })
    await page.addInitScript((theme) => {
      try {
        localStorage.setItem('theme', theme)
      } catch {
        // storage can be blocked
      }
    }, scheme)
    // Own trip and user: other specs flip Sven's locale while this runs.
    await login(page, '100000000000000002')
    const trip = await page.evaluate(async (mode) => {
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
      const created = await post('/api/trips', {
        name: `Phone a11y ${mode} ${Date.now().toString(36)}`,
        timezone: 'Asia/Tokyo',
        region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
      })
      const spot = await post(`/api/trips/${created.id}/spots`, {
        title: 'Shibuya Sky',
        lat: 35.658,
        lng: 139.702,
        baseCategory: 'maybe',
        address: 'Tokyo',
      })
      const entry = await post(`/api/trips/${created.id}/plan`, {
        type: 'bucket',
        title: 'Tokyo',
        startDate: '2026-04-12',
        endDate: '2026-04-16',
      })
      await post(`/api/plan/${entry.id}/spots`, {
        spotId: spot.id,
        visitDate: '2026-04-13',
      })
      return `/trips/${created.id}`
    }, scheme)

    await page.goto('/trips')
    await expect(page.getByText(`Phone a11y ${scheme}`).first()).toBeVisible({
      timeout: 15_000,
    })
    await expectNoSeriousViolations(page, `${scheme} trips`)

    await page.goto(`${trip}?view=list`)
    const list = page.getByTestId('spot-list')
    await expect(list.getByText('Shibuya Sky').first()).toBeVisible()
    await expectNoSeriousViolations(page, `${scheme} board list`)

    await list.getByText('Shibuya Sky').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectNoSeriousViolations(page, `${scheme} spot panel`)

    await page.goto(`${trip}/schedule`)
    await expect(page.getByTestId('schedule-list')).toBeVisible()
    await expectNoSeriousViolations(page, `${scheme} schedule`)

    await page.goto(trip)
    const bar = page.getByRole('navigation', { name: 'Trip sections' })
    await bar.getByRole('button', { name: 'More' }).click()
    const more = page.getByRole('dialog', { name: 'More' })
    await expect(more).toBeVisible()
    await expectNoSeriousViolations(page, `${scheme} More sheet`)
    await more.getByRole('button', { name: 'Members' }).click()
    await expect(page.getByRole('dialog', { name: 'Members' })).toBeVisible()
    await expectNoSeriousViolations(page, `${scheme} members dialog`)

    await page.goto('/account')
    await expect(
      page.getByRole('heading', { name: 'Account & settings' }),
    ).toBeVisible()
    await expectNoSeriousViolations(page, `${scheme} account`)

    await page.goto('/no-such-page')
    await expectNoSeriousViolations(page, `${scheme} not found`)

    await page.goto('/join/unknown')
    await expectNoSeriousViolations(page, `${scheme} invalid invite`)
  })
}

test('T-43-13 axe finds no serious issues on Extend storage and the admin Settings with the file size fields', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, '100000000000000001')
  await page.goto('/admin/users/00000000-0000-0000-0000-000000000003')
  await page.getByRole('button', { name: 'Extend storage' }).click()
  const dialog = page.getByRole('dialog', { name: 'Extend storage' })
  await expect(
    dialog.getByRole('spinbutton', { name: 'Max file size (MB)' }),
  ).toBeVisible()
  await expectNoSeriousViolations(page, 'Extend storage')
  await dialog
    .getByRole('spinbutton', { name: 'Max file size (MB)' })
    .fill('60')
  await expect(dialog.getByText('Between 1 and 50 MB')).toBeVisible()
  await expectNoSeriousViolations(page, 'Extend storage with the range error')

  await page.goto('/admin/settings')
  await expect(
    page.getByRole('spinbutton', { name: 'Default max file size (MB)' }),
  ).toBeVisible()
  await expectNoSeriousViolations(page, 'admin Settings')
})

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
    // The profile locale outranks the toggle and other specs flip it, so pin it.
    await fetch('/api/me', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'en' }),
    })
  }, discordId)
}

for (const scheme of ['light', 'dark'] as const) {
  test(`T-32-10 axe finds no serious issues on the kinds settings, the add menu and the symbol picker in ${scheme} mode`, async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.emulateMedia({ colorScheme: scheme })
    await login(page, '100000000000000001')
    await page.goto(`${japanTrip}/settings`)
    const section = page.getByTestId('kinds-section')
    await expect(section.getByTestId('kind-row').first()).toBeVisible()
    await expectNoSeriousViolations(page, `settings ${scheme}`)

    await section.getByTestId('kind-add-menu').scrollIntoViewIfNeeded()
    await settle(page)
    await section.getByTestId('kind-add-menu').click()
    await expect(page.getByRole('menu')).toBeVisible()
    await expectNoSeriousViolations(page, `add menu ${scheme}`)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)

    await section
      .getByRole('button', { name: /^Color and symbol of/ })
      .first()
      .click()
    await expect(section.getByTestId('symbol-picker')).toBeVisible()
    await expectNoSeriousViolations(page, `symbol picker ${scheme}`)
  })
}
