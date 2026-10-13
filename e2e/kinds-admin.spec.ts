import { expectNoSeriousViolations } from './a11y'
import { expect, test, type Page } from './fixtures'
import { showLocale } from './locale'

const sven = '100000000000000001'
const aiko = '100000000000000002'
const tom = '100000000000000003'

type Browser = Parameters<Parameters<typeof test>[2]>[0]['browser']
type Kind = { id: string; name: string | null; preset: string | null }

function freshDiscordId() {
  return `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`.slice(0, 18)
}

async function login(page: Page, discordId: string) {
  await page.goto('/login')
  await api(page, 'POST', '/test/login', { discordId })
}

async function api<T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return page.evaluate(
    async (input) => {
      const response = await fetch(`/api${input.path}`, {
        method: input.method,
        credentials: 'include',
        headers:
          input.body === undefined
            ? {}
            : { 'content-type': 'application/json' },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      })
      if (!response.ok) {
        throw new Error(`${input.method} ${input.path} ${response.status}`)
      }
      return response.status === 204 ? null : await response.json()
    },
    { method, path, body },
  ) as Promise<T>
}

async function createTrip(page: Page): Promise<string> {
  const trip = await api<{ id: string }>(page, 'POST', '/trips', {
    name: `Kinds ${Date.now()}`,
    timezone: 'Asia/Tokyo',
    region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
  })
  return trip.id
}

async function listKinds(page: Page, tripId: string): Promise<Kind[]> {
  const body = await api<{ kinds: Kind[] }>(
    page,
    'GET',
    `/trips/${tripId}/kinds`,
  )
  return body.kinds
}

function presetId(kinds: Kind[], preset: string): string {
  return kinds.find((kind) => kind.preset === preset)!.id
}

async function createSpot(
  page: Page,
  tripId: string,
  title: string,
  kindIds: string[],
): Promise<string> {
  const spot = await api<{ id: string }>(
    page,
    'POST',
    `/trips/${tripId}/spots`,
    { title, lat: 35.68, lng: 139.76, address: 'Tokyo', kindIds },
  )
  return spot.id
}

/** A new user (or a seeded one) joins the trip through an invite. */
async function join(
  owner: Page,
  guest: Page,
  tripId: string,
  role: 'planner' | 'visitor',
  discordId = freshDiscordId(),
): Promise<string> {
  const invite = await api<{ code: string }>(
    owner,
    'POST',
    `/trips/${tripId}/invites`,
    { role },
  )
  await login(guest, discordId)
  await api(guest, 'POST', `/join/${encodeURIComponent(invite.code)}`)
  const me = await api<{ id: string }>(guest, 'GET', '/me')
  return me.id
}

async function guestPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await showLocale(page, 'en')
  await page.setViewportSize({ width: 1280, height: 800 })
  return page
}

async function openSection(page: Page, tripId: string) {
  await page.goto(`/trips/${tripId}/settings`)
  const section = page.getByTestId('kinds-section')
  await expect(section).toBeVisible()
  await expect(section.getByTestId('kind-row').first()).toBeVisible()
  return section
}

function row(section: ReturnType<Page['locator']>, name: string) {
  return section.getByTestId('kind-row').filter({
    has: section.page().getByRole('textbox', { name: `Name of ${name}` }),
  })
}

/** Add kind menu, then Custom kind…; returns the new-kind form. */
async function openCustomForm(section: ReturnType<Page['locator']>) {
  await section.getByTestId('kind-add-menu').click()
  await section.page().getByTestId('kind-add-custom').click()
  const form = section.getByRole('form', { name: 'New kind' })
  await expect(form).toBeVisible()
  return form
}

test('T-28-12 only board admins and the owner see Spot kinds in the trip settings @chromium', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await showLocale(page, 'en')
  await login(page, sven)
  const tripId = await createTrip(page)
  const admin = await guestPage(browser)
  const planner = await guestPage(browser)
  const visitor = await guestPage(browser)
  const adminId = await join(page, admin, tripId, 'planner')
  await join(page, planner, tripId, 'planner', aiko)
  await join(page, visitor, tripId, 'visitor', tom)
  await api(page, 'PATCH', `/trips/${tripId}/members/${adminId}`, {
    role: 'admin',
  })

  await page.goto(`/trips/${tripId}/settings`)
  await expect(page.getByTestId('kinds-section')).toBeVisible()

  await openSection(admin, tripId)

  for (const other of [planner, visitor]) {
    await other.goto(`/trips/${tripId}`)
    await expect(
      other.getByRole('heading', { name: 'Things to do' }),
    ).toBeVisible()
    await expect(other.getByTestId('board-menu')).toHaveCount(0)
    await other.goto(`/trips/${tripId}/settings`)
    await expect(other.getByTestId('kinds-section')).toHaveCount(0)
    await other.goto(`/trips/${tripId}`)
  }
  await visitor.goto(`/trips/${tripId}?dialog=kinds`)
  await expect(
    visitor.getByRole('heading', { name: 'Things to do' }),
  ).toBeVisible()
  await expect(visitor.getByRole('dialog')).toHaveCount(0)
})

test('T-28-13 a board admin adds, reorders and renames kinds and the spot panel follows @chromium', async ({
  page,
}) => {
  test.setTimeout(30_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  const tripId = await createTrip(page)
  const before = await listKinds(page, tripId)
  const spotId = await createSpot(page, tripId, 'Ichiran Ramen', [
    presetId(before, 'maybe'),
  ])
  const section = await openSection(page, tripId)

  const form = await openCustomForm(section)
  await form.getByLabel('Name', { exact: true }).fill('Noodles')
  await form.getByRole('button', { name: '#D9480F' }).click()
  await form.getByRole('option', { name: 'Food', exact: true }).click()
  await form.getByRole('button', { name: 'Add kind' }).click()
  const noodles = row(section, 'Noodles')
  await expect(noodles).toBeVisible()
  await expect(noodles.getByTestId('kind-swatch')).toHaveCSS(
    'background-color',
    'rgb(217, 72, 15)',
  )

  await section.getByRole('button', { name: 'Move Noodles up' }).click()
  const names = section.getByTestId('kind-row').getByRole('textbox')
  await expect
    .poll(async () =>
      names.evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      ),
    )
    .toEqual(['Must go', 'Maybe', 'Food', 'Noodles', 'Sights'])

  const mustGo = section.getByRole('textbox', { name: 'Name of Must go' })
  await mustGo.fill('Top')
  await mustGo.press('Enter')
  await expect(
    section.getByRole('textbox', { name: 'Name of Top' }),
  ).toBeVisible()

  await page.goto(`/trips/${tripId}`)
  await page.getByTestId(`card-${spotId}`).click()
  const picker = page.getByTestId('kind-picker')
  const chip = (name: string) =>
    picker.locator('button[aria-pressed]').filter({
      has: page.locator('span:last-of-type', {
        hasText: new RegExp(`^${name}$`),
      }),
    })
  await expect(picker.locator('button[aria-pressed]')).toHaveCount(6)
  await expect(
    picker.locator('button[aria-pressed] > span:last-of-type'),
  ).toHaveText(['Top', 'Maybe', 'Food', 'Noodles', 'Sights', 'Home'])
  await chip('Food').click()
  await chip('Maybe').click()
  await chip('Top').click()
  await expect(chip('Maybe')).toBeDisabled()
  await expect(page.getByText('At most 2 kinds')).toBeVisible()
})

test('T-28-14 deleting a kind in use asks where its spots go @chromium', async ({
  page,
}) => {
  test.setTimeout(30_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  const tripId = await createTrip(page)
  const kinds = await listKinds(page, tripId)
  const foodId = presetId(kinds, 'food')
  const first = await createSpot(page, tripId, 'Ramen', [foodId])
  const second = await createSpot(page, tripId, 'Sushi', [foodId])
  const section = await openSection(page, tripId)
  await expect(row(section, 'Food').getByTestId('kind-count')).toHaveText(
    '2 spots',
  )

  await section.getByRole('button', { name: 'Delete Food' }).click()
  const confirm = page.getByTestId('kind-delete-dialog')
  await expect(confirm).toContainText('2 spots use Food.')
  const accept = confirm.getByTestId('kind-delete-accept')
  await expect(accept).toBeDisabled()
  await confirm.getByLabel('Move them to').selectOption({ label: 'Maybe' })
  await expect(accept).toBeEnabled()
  await accept.click()
  await expect(confirm).toHaveCount(0)
  await expect(row(section, 'Food')).toHaveCount(0)

  await page.goto(`/trips/${tripId}`)
  const maybeColor = '#30A46C'
  for (const id of [first, second]) {
    await expect(
      page.getByTestId(`card-${id}`).getByTestId('category-strip'),
    ).toHaveAttribute('data-kind-colors', maybeColor)
  }

  // Down to one kind: no delete button is left.
  const reopened = await openSection(page, tripId)
  for (const name of ['Must go', 'Sights']) {
    await reopened.getByRole('button', { name: `Delete ${name}` }).click()
    await page.getByTestId('kind-delete-accept').click()
    await expect(page.getByTestId('kind-delete-dialog')).toHaveCount(0)
  }
  await expect(reopened.getByTestId('kind-row')).toHaveCount(1)
  await expect(reopened.getByRole('button', { name: /^Delete/ })).toHaveCount(0)
  expect(presetId(kinds, 'maybe')).toBeTruthy()
})

test('T-28-15 another browser sees a new and recolored kind without a reload @chromium', async ({
  page,
  browser,
}) => {
  test.setTimeout(30_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  const tripId = await createTrip(page)
  const guest = await guestPage(browser)
  await join(page, guest, tripId, 'visitor')

  await guest.goto(`/trips/${tripId}`)
  await guest.getByRole('button', { name: 'Filter' }).click()
  const region = guest.getByRole('region', { name: 'Filter' })
  const chip = (name: string) =>
    region.getByRole('button', { name: new RegExp(`^${name}\\b`) })
  await expect(chip('Must go')).toBeVisible()
  await expect(chip('Noodles')).toHaveCount(0)

  const section = await openSection(page, tripId)
  const form = await openCustomForm(section)
  await form.getByLabel('Name', { exact: true }).fill('Noodles')
  await form.getByRole('button', { name: 'Add kind' }).click()
  await expect(row(section, 'Noodles')).toBeVisible()
  await expect(chip('Noodles')).toBeVisible()

  const kinds = await listKinds(page, tripId)
  const foodId = kinds.find((kind) => kind.name === 'Noodles')!.id
  const spotId = await createSpot(page, tripId, 'Ramen', [foodId])
  const strip = guest
    .getByTestId(`card-${spotId}`)
    .getByTestId('category-strip')
  await expect(strip).toHaveAttribute('data-kind-colors', '#D9480F')

  await row(section, 'Noodles')
    .getByRole('button', { name: 'Color and symbol of Noodles' })
    .click()
  await row(section, 'Noodles').getByRole('button', { name: '#0F766E' }).click()
  await expect(strip).toHaveAttribute('data-kind-colors', '#0F766E')
})

for (const scheme of ['light', 'dark'] as const) {
  test(`T-28-19 the kinds section and delete confirm pass axe in ${scheme} mode and reorder by keyboard @chromium`, async ({
    page,
  }) => {
    test.setTimeout(30_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.emulateMedia({ colorScheme: scheme })
    await login(page, freshDiscordId())
    const tripId = await createTrip(page)
    const kinds = await listKinds(page, tripId)
    await createSpot(page, tripId, 'Ramen', [presetId(kinds, 'maybe')])
    const section = await openSection(page, tripId)
    await expectNoSeriousViolations(page, {
      include: '[data-testid="kinds-section"]',
      label: `section ${scheme}`,
    })

    const down = section.getByRole('button', { name: 'Move Food down' })
    await down.focus()
    await page.keyboard.press('Enter')
    await expect
      .poll(async () =>
        section
          .getByTestId('kind-row')
          .getByRole('textbox')
          .evaluateAll((inputs) =>
            inputs.map((input) => (input as HTMLInputElement).value),
          ),
      )
      .toEqual(['Must go', 'Maybe', 'Sights', 'Food'])
    // Focus stays on the row's move buttons after the move.
    await expect(
      section.getByRole('button', { name: 'Move Food down' }),
    ).toBeDisabled()
    await expect(
      section.getByRole('button', { name: 'Move Food up' }),
    ).toBeFocused()

    await section.getByRole('button', { name: 'Delete Maybe' }).click()
    await expect(page.getByTestId('kind-delete-dialog')).toBeVisible()
    await expectNoSeriousViolations(page, {
      include: '[data-testid="kind-delete-dialog"]',
      label: `confirm ${scheme}`,
    })
  })
}
