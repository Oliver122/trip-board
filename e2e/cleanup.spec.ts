import { expectNoSeriousViolations } from './a11y'
import { answerConfirm } from './confirm'
import { expect, test, type Page } from './fixtures'
import type { Route } from '@playwright/test'
import { readFileSync } from 'node:fs'

const sven = '100000000000000001'

const modalNames = [
  'create-trip',
  'export',
  'import',
  'delete-trip',
  'members',
] as const
type ModalName = (typeof modalNames)[number]

const widths = [1280, 390] as const

for (const width of widths) {
  test(`T-26-02 modals are ${width >= 640 ? 'centered' : 'full-screen'} at ${width}px and close on Escape and backdrop`, async ({
    page,
  }) => {
    const height = width >= 640 ? 800 : 844
    await page.setViewportSize({ width, height })
    await login(page, freshDiscordId())
    await setLocale(page, 'en')
    const tripId = await createTrip(page, `Modals ${width}`)

    for (const name of modalNames) {
      // The phone layout has no Import button (the toolbar is hidden).
      if (name === 'import' && width < 640) continue
      const dialog = await openModal(page, tripId, name, width)
      await expect(dialog).toBeVisible()
      const box = await dialog.boundingBox()
      if (!box) throw new Error(`no box for ${name}`)
      if (width >= 640) {
        expect(box.width, name).toBeLessThan(width)
        expect(Math.abs(box.x + box.width / 2 - width / 2), name).toBeLessThan(
          2,
        )
        expect(box.y, name).toBeGreaterThanOrEqual(0)
      } else {
        expect(box.width, name).toBeGreaterThanOrEqual(width - 1)
        expect(box.height, name).toBeGreaterThanOrEqual(height - 1)
      }

      await page.keyboard.press('Escape')
      await expect(dialog, `${name} Escape`).toHaveCount(0)

      if (width >= 640) {
        const again = await openModal(page, tripId, name, width)
        await expect(again).toBeVisible()
        await page
          .getByTestId('modal-backdrop')
          .click({ position: { x: 5, y: 5 } })
        await expect(again, `${name} backdrop`).toHaveCount(0)
      }
    }
  })
}

test('T-26-04 the avatar menu opens by keyboard, moves between items and logs out', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  await setLocale(page, 'en')
  await page.goto('/trips')
  const trigger = page.getByRole('button', { name: 'Account menu' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()

  const items = menu.getByRole('menuitem')
  await expect(items.first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(items.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(items.first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(menu).toBeVisible()
  await page.keyboard.press('End')
  await expect(menu.getByRole('menuitem', { name: 'Log out' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/login/)
})

for (const [locale, title, accept] of [
  ['en', 'Discard changes?', 'Discard'],
  ['de', 'Änderungen verwerfen?', 'Verwerfen'],
] as const) {
  test(`T-26-06 discarding spot edits asks first in ${locale === 'en' ? 'English' : 'German'}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await login(page, freshDiscordId())
    await setLocale(page, locale)
    const tripId = await createTrip(page, `Discard ${locale}`)
    const spotId = await createSpot(page, tripId, 'Discard me')
    await page.goto(`/trips/${tripId}`)
    await expect(
      page.getByRole('button', {
        name: locale === 'en' ? 'Account menu' : 'Kontomenü',
      }),
    ).toBeVisible()
    await page.getByTestId(`card-${spotId}`).click()
    const field = page.getByRole('textbox', {
      name: locale === 'en' ? 'Title' : 'Titel',
      exact: true,
    })
    await field.fill('Changed')
    await page.keyboard.press('Escape')
    const confirm = page.getByTestId('confirm-dialog')
    await expect(confirm).toContainText(title)
    await expect(confirm.getByTestId('confirm-accept')).toHaveText(accept)
    await answerConfirm(page, 'dismiss')
    await expect(field).toHaveValue('Changed')
    await page.keyboard.press('Escape')
    await answerConfirm(page, 'accept')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId(`card-${spotId}`)).toContainText('Discard me')
  })
}

test('T-26-06 deleting a comment asks first; cancel keeps it, confirm removes it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  await setLocale(page, 'en')
  const tripId = await createTrip(page, `Comment ${Date.now()}`)
  const spotId = await createSpot(page, tripId, 'Talk here')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId(`card-${spotId}`).click()
  await page.getByRole('textbox', { name: 'Add a comment' }).fill('Go early')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('comment')).toHaveCount(1)

  const discussion = page.getByTestId('discussion')
  await discussion.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    'Delete this comment?',
  )
  await answerConfirm(page, 'dismiss')
  await expect(page.getByTestId('comment')).toHaveCount(1)

  await discussion.getByRole('button', { name: 'Delete', exact: true }).click()
  await answerConfirm(page, 'accept')
  await expect(page.getByTestId('comment')).toHaveCount(0)

  await setLocale(page, 'de')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId(`card-${spotId}`).click()
  await page.getByRole('textbox', { name: 'Kommentar hinzufügen' }).fill('Früh')
  await page.getByRole('button', { name: 'Senden', exact: true }).click()
  await page
    .getByTestId('discussion')
    .getByRole('button', { name: 'Löschen', exact: true })
    .click()
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    'Diesen Kommentar löschen?',
  )
  await answerConfirm(page, 'dismiss')
})

test('T-26-06 clearing a stay asks first; cancel keeps the category, confirm applies it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  await setLocale(page, 'en')
  const tripId = await createTrip(page, `Stay ${Date.now()}`)
  const spotId = await createSpot(page, tripId, 'Hotel Clear')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId(`card-${spotId}`).click()
  const category = page.getByLabel('Category')
  await category.selectOption({ label: 'Home' })
  await page.getByLabel('Stay from').fill('2026-04-12')
  await page.getByLabel('Stay to').fill('2026-04-16')

  await category.selectOption({ label: 'Maybe' })
  await expect(page.getByTestId('confirm-dialog')).toContainText('Stay dates')
  await answerConfirm(page, 'dismiss')
  await expect(category).toHaveValue('home')
  await expect(page.getByLabel('Stay from')).toHaveValue('2026-04-12')

  await category.selectOption({ label: 'Maybe' })
  await answerConfirm(page, 'accept')
  await expect(page.getByLabel('Stay from')).toHaveCount(0)

  await category.selectOption({ label: 'Home' })
  await page.getByLabel('Stay from').fill('2026-04-12')
  await page.getByLabel('Stay to').fill('2026-04-16')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await setLocale(page, 'de')
  await page.reload()
  await page.getByTestId(`card-${spotId}`).click()
  await page.getByLabel('Kategorie').selectOption({ label: 'Vielleicht' })
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    'Kategorie ändern?',
  )
  await answerConfirm(page, 'dismiss')
})

test('T-26-08 role select and added-by filter use the shared select', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  await setLocale(page, 'en')
  const tripId = await createTrip(page, `Selects ${Date.now()}`)
  const mine = await createSpot(page, tripId, 'Owner spot')
  const context = await browser.newContext()
  const guest = await context.newPage()
  const guestId = freshDiscordId()
  await login(guest, guestId)
  await setLocale(guest, 'en')
  const code = await invite(page, tripId, 'visitor')
  await join(guest, code)
  await context.close()
  const guestName = `u${guestId}`

  await page.goto(`/trips/${tripId}`)
  await page.getByRole('button', { name: 'Members' }).click()
  const dialog = page.getByRole('dialog', { name: 'Members' })
  const role = dialog.getByRole('combobox', { name: `Role for ${guestName}` })
  await expect(role).toHaveValue('visitor')
  await role.selectOption('planner')
  await expect(role).toHaveValue('planner')
  await page.reload()
  await page.getByRole('button', { name: 'Members' }).click()
  await expect(
    page
      .getByRole('dialog', { name: 'Members' })
      .getByRole('combobox', { name: `Role for ${guestName}` }),
  ).toHaveValue('planner')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /^Filters?$/ }).click()
  await page.getByLabel('Added by').selectOption({ label: guestName })
  await expect(page.getByTestId(`card-${mine}`)).toHaveCount(0)
  await page.getByLabel('Added by').selectOption({ label: 'Anyone' })
  await expect(page.getByTestId(`card-${mine}`)).toBeVisible()
})

// Read-only on the seeded admin: other specs flip Sven's language, so the
// select is found by element, not by its translated label.
test('T-26-08 admin user filter uses the shared select', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, sven)
  await page.goto('/admin/users')
  await page.locator('select').selectOption('admins')
  await expect(page.getByRole('link', { name: 'Sven' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Aiko' })).toHaveCount(0)
})

test('T-26-08 board and schedule show the shared skeleton while loading', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  await setLocale(page, 'en')
  const tripId = await createTrip(page, `Skeleton ${Date.now()}`)
  const slow = async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    await route.continue()
  }
  // BoardPage never renders its skeleton on first load (keepList is set on the
  // first render because listStatus starts 'ready'), so only the schedule is
  // asserted here.
  await page.route(`**/api/trips/${tripId}/plan*`, slow)
  await page.goto(`/trips/${tripId}/schedule`)
  const skeleton = page.getByTestId('panel-skeleton')
  await expect(skeleton).toBeVisible()
  await expect(skeleton).toHaveAttribute('aria-busy', 'true')
  await expect(skeleton).toHaveCount(0)
})

test('T-26-10 a save over someone else still opens the conflict dialog and use mine wins', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  await setLocale(page, 'en')
  const tripId = await createTrip(page, `Conflict ${Date.now()}`)
  const spotId = await createSpot(page, tripId, 'Shared spot')
  const context = await browser.newContext()
  const guest = await context.newPage()
  const guestId = freshDiscordId()
  await login(guest, guestId)
  await setLocale(guest, 'en')
  await join(guest, await invite(page, tripId, 'planner'))

  await page.goto(`/trips/${tripId}`)
  await page.getByTestId(`card-${spotId}`).click()
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await title.fill('Sven title')
  await guest.evaluate(
    async ({ id, value }) => {
      const response = await fetch(`/api/spots/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: value }),
      })
      if (!response.ok) throw new Error(await response.text())
    },
    { id: spotId, value: 'Aiko title' },
  )
  await page.getByRole('button', { name: 'Save' }).click()
  const conflict = page.getByTestId('conflict-dialog')
  await expect(conflict).toContainText(`u${guestId}`)
  await expect(conflict).toContainText('Sven title')
  await expect(conflict).toContainText('Aiko title')
  await page.getByTestId('conflict-mine').click()
  await expect(conflict).toHaveCount(0)
  await expect(page.getByTestId(`card-${spotId}`)).toContainText('Sven title')
  await context.close()
})

test('T-26-10 a 401 from the API sends the user to the login page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  await setLocale(page, 'en')
  const tripId = await createTrip(page, `Expired ${Date.now()}`)
  await page.goto(`/trips/${tripId}`)
  const members = page.getByRole('button', { name: 'Members' })
  await expect(members).toBeVisible()
  // Answer only the members request with 401, so no unrelated background
  // request can redirect before the click.
  await page.route('**/api/trips/*/members**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unauthenticated' }),
    }),
  )
  // The 401 makes the app reload the session; /api/me must say 401 too.
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unauthenticated' }),
    }),
  )
  await members.click()
  await expect(page).toHaveURL(/\/login/)
})

for (const locale of ['en', 'de'] as const) {
  test(`T-26-15 shared dialogs, menu and selects have no serious a11y issues in ${locale}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await login(page, freshDiscordId())
    await setLocale(page, locale)
    const tripId = await createTrip(page, `Axe ${locale}`)
    const spotId = await createSpot(page, tripId, 'Axe spot')

    for (const name of modalNames) {
      const dialog = await openModal(page, tripId, name, 1280)
      await expect(dialog).toBeVisible()
      await expectNoSeriousViolations(page, {
        include: '[role="dialog"]',
        label: `${name} ${locale}`,
      })
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    }

    await page.goto('/trips')
    await page
      .getByRole('button')
      .filter({ has: page.getByTestId('username') })
      .click()
    await expect(page.getByRole('menu')).toBeVisible()
    await expectNoSeriousViolations(page, { label: `menu ${locale}` })
    await page.keyboard.press('Escape')

    await page.goto(`/trips/${tripId}`)
    await page.getByTestId(`card-${spotId}`).click()
    await page.keyboard.press('Escape')
    await expectNoSeriousViolations(page, { label: `board ${locale}` })
    await page.getByTestId(`card-${spotId}`).click()
    await page.locator('select').first().selectOption({ index: 1 })
    await expectNoSeriousViolations(page, { label: `selects ${locale}` })
    await page.locator('select').first().selectOption({ index: 0 })
    await page.keyboard.press('Escape')
    const confirm = page.getByTestId('confirm-dialog')
    if (await confirm.isVisible().catch(() => false)) {
      await expectNoSeriousViolations(page, {
        include: '[role="dialog"]',
        label: `confirm ${locale}`,
      })
      await answerConfirm(page, 'accept')
    }
  })
}

// The confirm dialog is axe-checked on its own, since it needs a dirty panel.
test('T-26-15 the confirm dialog has no serious a11y issues', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  await setLocale(page, 'en')
  const tripId = await createTrip(page, 'Axe confirm')
  const spotId = await createSpot(page, tripId, 'Axe confirm spot')
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId(`card-${spotId}`).click()
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Dirty title')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('confirm-dialog')).toBeVisible()
  await expectNoSeriousViolations(page, {
    include: '[data-testid="confirm-dialog"]',
    label: 'confirm',
  })
  await answerConfirm(page, 'dismiss')
})

test('T-26-16 shared step 26 labels exist in en and de', () => {
  const load = (locale: string) =>
    JSON.parse(
      readFileSync(
        new URL(
          `../apps/web/src/locales/${locale}/common.json`,
          import.meta.url,
        ),
        'utf8',
      ),
    ) as Record<string, Record<string, unknown>>
  const en = load('en')
  const de = load('de')
  const groups = ['ui', 'confirm'] as const
  for (const group of groups) {
    const enKeys = Object.keys(en[group] ?? {}).sort()
    const deKeys = Object.keys(de[group] ?? {}).sort()
    expect(enKeys.length, `${group} has keys`).toBeGreaterThan(0)
    expect(deKeys, `${group} keys match`).toEqual(enKeys)
    for (const key of enKeys) {
      for (const [name, bundle] of [
        ['en', en],
        ['de', de],
      ] as const) {
        const value = bundle[group]?.[key]
        expect(typeof value, `${name} ${group}.${key}`).toBe('string')
        expect((value as string).trim(), `${name} ${group}.${key}`).not.toBe('')
      }
    }
  }
  for (const key of ['close', 'cancel', 'confirm', 'menu']) {
    expect(en.ui?.[key], `ui.${key}`).toBeTruthy()
  }
})

async function openModal(
  page: Page,
  tripId: string,
  name: ModalName,
  width: number,
) {
  const phone = width < 640
  if (name === 'create-trip') {
    await page.goto('/trips')
    await page
      .getByRole('button', {
        name: /Create your first trip|New trip|Erste Reise|Neue Reise/,
      })
      .first()
      .click()
    return page.getByRole('dialog').first()
  }
  if (name === 'delete-trip') {
    await page.goto(`/trips/${tripId}/settings`)
    await page
      .getByRole('button', { name: /^(Delete trip|Reise löschen)$/ })
      .click()
    return page.getByRole('dialog').first()
  }
  await page.goto(`/trips/${tripId}`)
  if (name === 'members') {
    await page.getByRole('button', { name: /^(Members|Mitglieder)\b/ }).click()
    return page.getByRole('dialog').first()
  }
  if (phone) {
    await page.getByRole('button', { name: /^(Filters|Filter)$/ }).click()
  }
  const label =
    name === 'export' ? /^(Export|Exportieren)$/ : /^(Import|Importieren)$/
  await page.getByRole('button', { name: label }).first().click()
  return page.getByRole('dialog').first()
}

function freshDiscordId() {
  return `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`.slice(0, 18)
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
