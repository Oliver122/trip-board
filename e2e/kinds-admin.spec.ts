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

async function openDialog(page: Page) {
  await page.getByRole('button', { name: 'Board menu' }).click()
  await page.getByRole('menuitem', { name: 'Spot kinds' }).click()
  const dialog = page.getByRole('dialog', { name: 'Spot kinds' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('kind-row').first()).toBeVisible()
  return dialog
}

function row(dialog: ReturnType<Page['locator']>, name: string) {
  return dialog.getByTestId('kind-row').filter({
    has: dialog.page().getByRole('textbox', { name: `Name of ${name}` }),
  })
}

test('T-28-12 only board admins and the owner see Spot kinds in the board menu @chromium', async ({
  page,
  browser,
}) => {
  test.setTimeout(30_000)
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

  await page.goto(`/trips/${tripId}`)
  await expect(page.getByRole('button', { name: 'Board menu' })).toBeVisible()

  await admin.goto(`/trips/${tripId}`)
  await openDialog(admin)

  for (const other of [planner, visitor]) {
    await other.goto(`/trips/${tripId}`)
    await expect(
      other.getByRole('heading', { name: 'Things to do' }),
    ).toBeVisible()
    await expect(other.getByRole('button', { name: 'Board menu' })).toHaveCount(
      0,
    )
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
  await page.goto(`/trips/${tripId}`)
  const dialog = await openDialog(page)

  const form = dialog.getByRole('form', { name: 'New kind' })
  await form.getByLabel('Name').fill('Food')
  await form.getByRole('button', { name: '#D9480F' }).click()
  await form.getByRole('button', { name: 'Food', exact: true }).click()
  await form.getByRole('button', { name: 'Add kind' }).click()
  const food = row(dialog, 'Food')
  await expect(food).toBeVisible()
  await expect(food.getByTestId('kind-swatch')).toHaveCSS(
    'background-color',
    'rgb(217, 72, 15)',
  )

  await dialog.getByRole('button', { name: 'Move Food up' }).click()
  const names = dialog.getByTestId('kind-row').getByRole('textbox')
  await expect
    .poll(async () =>
      names.evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      ),
    )
    .toEqual(['Must go', 'Food', 'Maybe'])

  const mustGo = dialog.getByRole('textbox', { name: 'Name of Must go' })
  await mustGo.fill('Top')
  await mustGo.press('Enter')
  await expect(
    dialog.getByRole('textbox', { name: 'Name of Top' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await page.getByTestId(`card-${spotId}`).click()
  const picker = page.getByTestId('kind-picker')
  await expect(picker.getByRole('checkbox')).toHaveCount(4)
  await expect
    .poll(async () => picker.locator('label').allTextContents())
    .toEqual(['Top', 'Food', 'Maybe', 'Home'])
  await picker.getByRole('checkbox', { name: 'Food' }).check()
  await picker.getByRole('checkbox', { name: 'Maybe' }).uncheck()
  await picker.getByRole('checkbox', { name: 'Top' }).check()
  await expect(picker.getByRole('checkbox', { name: 'Maybe' })).toBeDisabled()
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
  const food = await api<{ id: string }>(
    page,
    'POST',
    `/trips/${tripId}/kinds`,
    { name: 'Food', color: '#D9480F', symbol: 'food' },
  )
  const first = await createSpot(page, tripId, 'Ramen', [food.id])
  const second = await createSpot(page, tripId, 'Sushi', [food.id])
  await page.goto(`/trips/${tripId}`)
  const dialog = await openDialog(page)
  await expect(row(dialog, 'Food').getByTestId('kind-count')).toHaveText(
    '2 spots',
  )

  await dialog.getByRole('button', { name: 'Delete Food' }).click()
  const confirm = page.getByTestId('kind-delete-dialog')
  await expect(confirm).toContainText('2 spots use Food.')
  const accept = confirm.getByTestId('kind-delete-accept')
  await expect(accept).toBeDisabled()
  await confirm.getByLabel('Move them to').selectOption({ label: 'Maybe' })
  await expect(accept).toBeEnabled()
  await accept.click()
  await expect(confirm).toHaveCount(0)
  await expect(row(dialog, 'Food')).toHaveCount(0)

  await page.keyboard.press('Escape')
  const maybeColor = '#30A46C'
  for (const id of [first, second]) {
    await expect(
      page.getByTestId(`card-${id}`).getByTestId('category-strip'),
    ).toHaveAttribute('data-kind-colors', maybeColor)
  }

  // Down to one kind: no delete button is left.
  const reopened = await openDialog(page)
  await reopened.getByRole('button', { name: 'Delete Must go' }).click()
  await page.getByTestId('kind-delete-accept').click()
  await expect(page.getByTestId('kind-delete-dialog')).toHaveCount(0)
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
  await expect(region.getByLabel('Must go')).toBeVisible()
  await expect(region.getByLabel('Food')).toHaveCount(0)

  await page.goto(`/trips/${tripId}`)
  const dialog = await openDialog(page)
  const form = dialog.getByRole('form', { name: 'New kind' })
  await form.getByLabel('Name').fill('Food')
  await form.getByRole('button', { name: 'Add kind' }).click()
  await expect(row(dialog, 'Food')).toBeVisible()
  await expect(region.getByLabel('Food')).toBeVisible()

  const kinds = await listKinds(page, tripId)
  const foodId = kinds.find((kind) => kind.name === 'Food')!.id
  const spotId = await createSpot(page, tripId, 'Ramen', [foodId])
  const strip = guest
    .getByTestId(`card-${spotId}`)
    .getByTestId('category-strip')
  await expect(strip).toHaveAttribute('data-kind-colors', '#D9480F')

  await row(dialog, 'Food')
    .getByRole('button', { name: 'Color and symbol of Food' })
    .click()
  await row(dialog, 'Food').getByRole('button', { name: '#0F766E' }).click()
  await expect(strip).toHaveAttribute('data-kind-colors', '#0F766E')
})

for (const scheme of ['light', 'dark'] as const) {
  test(`T-28-19 the kinds dialog and delete confirm pass axe in ${scheme} mode and reorder by keyboard @chromium`, async ({
    page,
  }) => {
    test.setTimeout(30_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.emulateMedia({ colorScheme: scheme })
    await login(page, freshDiscordId())
    const tripId = await createTrip(page)
    const kinds = await listKinds(page, tripId)
    await createSpot(page, tripId, 'Ramen', [presetId(kinds, 'maybe')])
    await page.goto(`/trips/${tripId}`)
    const dialog = await openDialog(page)
    await expectNoSeriousViolations(page, {
      include: '[data-testid="kinds-dialog"]',
      label: `dialog ${scheme}`,
    })

    const down = dialog.getByRole('button', { name: 'Move Must go down' })
    await down.focus()
    await page.keyboard.press('Enter')
    await expect
      .poll(async () =>
        dialog
          .getByTestId('kind-row')
          .getByRole('textbox')
          .evaluateAll((inputs) =>
            inputs.map((input) => (input as HTMLInputElement).value),
          ),
      )
      .toEqual(['Maybe', 'Must go'])
    // Focus stays on the row's move buttons after the move.
    await expect(
      dialog.getByRole('button', { name: 'Move Must go down' }),
    ).toBeDisabled()
    await expect(
      dialog.getByRole('button', { name: 'Move Must go up' }),
    ).toBeFocused()

    await dialog.getByRole('button', { name: 'Delete Maybe' }).click()
    await expect(page.getByTestId('kind-delete-dialog')).toBeVisible()
    await expectNoSeriousViolations(page, {
      include: '[data-testid="kind-delete-dialog"]',
      label: `confirm ${scheme}`,
    })
  })
}
