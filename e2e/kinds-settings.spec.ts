import { expect, test, type Locator, type Page } from './fixtures'
import { showLocale } from './locale'

const sven = '100000000000000001'
const aiko = '100000000000000002'
const tom = '100000000000000003'
const japan = '10000000-0000-0000-0000-000000000001'

type Browser = Parameters<Parameters<typeof test>[2]>[0]['browser']
type Kind = { id: string; name: string | null; preset: string | null }

function freshDiscordId() {
  return `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`.slice(0, 18)
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

async function login(page: Page, discordId: string) {
  await page.goto('/login')
  await api(page, 'POST', '/test/login', { discordId })
}

async function createTrip(page: Page): Promise<string> {
  const trip = await api<{ id: string }>(page, 'POST', '/trips', {
    name: `Kinds settings ${Date.now()}`,
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

/** A fresh owner with a trip whose only kinds are Must go, Maybe and Food. */
async function threeKindTrip(page: Page): Promise<string> {
  await login(page, freshDiscordId())
  const tripId = await createTrip(page)
  const sights = (await listKinds(page, tripId)).find(
    (kind) => kind.preset === 'sights',
  )
  if (!sights) throw new Error('sights kind is missing')
  await api(page, 'DELETE', `/trips/${tripId}/kinds/${sights.id}`)
  return tripId
}

function names(section: Locator) {
  return section
    .getByTestId('kind-row')
    .getByRole('textbox')
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    )
}

test('T-32-01 the owner manages kinds in the settings section and the board has no menu @chromium', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await showLocale(page, 'en')
  await login(page, sven)
  try {
    await page.goto(`/trips/${japan}`)
    await expect(
      page.getByRole('heading', { name: 'Things to do' }),
    ).toBeVisible()
    await expect(page.getByTestId('board-menu')).toHaveCount(0)

    await page.goto(`/trips/${japan}/settings`)
    const section = page.getByTestId('kinds-section')
    await expect(
      section.getByRole('heading', { name: 'Spot kinds' }),
    ).toBeVisible()
    await expect.poll(() => names(section)).toEqual(['Must go', 'Maybe'])
    await expect(section.getByTestId('kind-count')).toHaveCount(2)
    await expect(section.getByTestId('kind-total')).toHaveText('2 of 12 kinds')

    await section.getByTestId('kind-add-menu').click()
    await page.getByRole('menuitem', { name: 'Coffee' }).click()
    await expect(section.getByTestId('kind-total')).toHaveText('3 of 12 kinds')
    const coffee = section.getByRole('textbox', { name: 'Name of Coffee' })
    await coffee.fill('Latte')
    await coffee.press('Enter')
    await expect(
      section.getByRole('textbox', { name: 'Name of Latte' }),
    ).toBeVisible()
    await section.getByRole('button', { name: 'Move Latte up' }).click()
    await expect
      .poll(() => names(section))
      .toEqual(['Must go', 'Latte', 'Maybe'])

    await page.reload()
    await expect
      .poll(() => names(page.getByTestId('kinds-section')))
      .toEqual(['Must go', 'Latte', 'Maybe'])

    await section.getByRole('button', { name: 'Delete Latte' }).click()
    await page.getByTestId('kind-delete-accept').click()
    await expect(page.getByTestId('kind-delete-dialog')).toHaveCount(0)
    await expect(section.getByTestId('kind-total')).toHaveText('2 of 12 kinds')

    await page.reload()
    await expect
      .poll(() => names(page.getByTestId('kinds-section')))
      .toEqual(['Must go', 'Maybe'])
  } finally {
    // Leave the seed trip as it was, also when a step above failed.
    const added = (await listKinds(page, japan)).filter(
      (kind) => kind.preset !== 'must_go' && kind.preset !== 'maybe',
    )
    for (const kind of added) {
      await api(page, 'DELETE', `/trips/${japan}/kinds/${kind.id}`).catch(
        () => undefined,
      )
    }
  }
})

test('T-32-02 planners and visitors see no kinds section and no board menu @chromium', async ({
  page,
}) => {
  test.setTimeout(30_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await showLocale(page, 'en')
  for (const discordId of [aiko, tom]) {
    await login(page, discordId)
    await page.goto(`/trips/${japan}/settings`)
    await expect(
      page.getByRole('heading', { name: 'Japan 2026', level: 1 }),
    ).toBeVisible()
    await expect(page.locator('#kinds')).toHaveCount(0)
    await expect(page.getByTestId('kinds-section')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Spot kinds' })).toHaveCount(
      0,
    )

    await page.goto(`/trips/${japan}`)
    await expect(
      page.getByRole('heading', { name: 'Things to do' }),
    ).toBeVisible()
    await expect(page.getByTestId('board-menu')).toHaveCount(0)
  }
})

test('T-32-03 the old kinds link lands on the settings section for the owner and is dropped for a visitor @chromium', async ({
  page,
}) => {
  test.setTimeout(30_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await showLocale(page, 'en')
  await login(page, sven)
  await page.goto(`/trips/${japan}?dialog=kinds`)
  await expect(page).toHaveURL(new RegExp(`/trips/${japan}/settings#kinds$`))
  const heading = page.getByRole('heading', { name: 'Spot kinds' })
  await expect(heading).toBeInViewport()
  await expect(heading).toBeFocused()

  await login(page, tom)
  await page.goto(`/trips/${japan}?dialog=kinds`)
  await expect(
    page.getByRole('heading', { name: 'Things to do' }),
  ).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/trips/${japan}$`))
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('kinds-section')).toHaveCount(0)
  await expect(page.getByTestId('board-menu')).toHaveCount(0)
})

const viewports = [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 375, height: 667 },
]

for (const viewport of viewports) {
  test(`T-32-04 the Add kind menu fits the viewport at ${viewport.width}x${viewport.height} @chromium`, async ({
    page,
  }) => {
    test.setTimeout(30_000)
    await page.setViewportSize(viewport)
    await showLocale(page, 'en')
    const tripId = await threeKindTrip(page)
    await page.goto(`/trips/${tripId}/settings`)
    const section = page.getByTestId('kinds-section')
    await expect(section.getByTestId('kind-row')).toHaveCount(3)
    const trigger = section.getByTestId('kind-add-menu')

    // Room above and below the section, so the button can sit at either edge.
    await page.getByTestId('settings-scroll').evaluate((scroll) => {
      for (const where of ['before', 'after'] as const) {
        const spacer = document.createElement('div')
        spacer.style.height = '1500px'
        spacer.setAttribute('aria-hidden', 'true')
        const section = scroll.querySelector('#kinds') as HTMLElement
        if (where === 'before') section.before(spacer)
        else section.after(spacer)
      }
    })

    // Distance of the button from the scroll column's top or bottom edge.
    const gap = (edge: 'top' | 'bottom') =>
      trigger.evaluate((button, target) => {
        const scroll = button.closest(
          '[data-testid="settings-scroll"]',
        ) as HTMLElement
        const area = scroll.getBoundingClientRect()
        const rect = button.getBoundingClientRect()
        return Math.round(
          target === 'top' ? rect.top - area.top : area.bottom - rect.bottom,
        )
      }, edge)

    const place = async (edge: 'top' | 'bottom') => {
      const before = await gap(edge)
      await trigger.evaluate(
        (button, delta) => {
          const scroll = button.closest(
            '[data-testid="settings-scroll"]',
          ) as HTMLElement
          scroll.scrollTop += delta
        },
        edge === 'top' ? before - 20 : 20 - before,
      )
      await expect.poll(() => gap(edge)).toBe(20)
      // Let the scroll event pass, so it cannot close the menu we open next.
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      )
    }

    const expectMenu = async (edge: 'top' | 'bottom') => {
      await place(edge)
      await trigger.click()
      const items = page.getByRole('menuitem')
      await expect(items).toHaveCount(6)
      await expect(items.last()).toHaveText('Custom kind…')
      const triggerBox = (await trigger.boundingBox())!
      const menuBox = (await page.getByRole('menu').boundingBox())!
      for (let index = 0; index < 6; index++) {
        const box = (await items.nth(index).boundingBox())!
        expect(box.x, `item ${index} left`).toBeGreaterThanOrEqual(8)
        expect(box.y, `item ${index} top`).toBeGreaterThanOrEqual(8)
        expect(box.x + box.width, `item ${index} right`).toBeLessThanOrEqual(
          viewport.width - 8,
        )
        expect(box.y + box.height, `item ${index} bottom`).toBeLessThanOrEqual(
          viewport.height - 8,
        )
      }
      if (edge === 'bottom') {
        expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(triggerBox.y)
      } else {
        expect(menuBox.y).toBeGreaterThanOrEqual(
          triggerBox.y + triggerBox.height,
        )
      }
      await page.keyboard.press('Escape')
      await expect(page.getByRole('menu')).toHaveCount(0)
    }

    await expectMenu('bottom')
    await expectMenu('top')
  })
}

test('T-32-08 a kind added in one browser shows in the other, and an approved limit updates the open section @chromium', async ({
  page,
  browser,
}: {
  page: Page
  browser: Browser
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await showLocale(page, 'en')
  await login(page, sven)
  const tripId = await createTrip(page)
  await api(page, 'PATCH', `/admin/trips/${tripId}/kind-limit`, {
    maxKinds: 5,
  })
  await page.goto(`/trips/${tripId}/settings`)
  const watching = page.getByTestId('kinds-section')
  await expect(watching.getByTestId('kind-total')).toHaveText('4 of 5 kinds')

  const otherContext = await browser.newContext()
  const other = await otherContext.newPage()
  await other.setViewportSize({ width: 1280, height: 900 })
  await showLocale(other, 'en')
  await login(other, sven)
  await other.goto(`/trips/${tripId}/settings`)
  const adding = other.getByTestId('kinds-section')
  await expect(adding.getByTestId('kind-total')).toHaveText('4 of 5 kinds')
  await adding.getByTestId('kind-add-menu').click()
  await other.getByRole('menuitem', { name: 'Coffee' }).click()

  await expect(watching.getByTestId('kind-total')).toHaveText('5 of 5 kinds', {
    timeout: 2_000,
  })
  await expect(
    watching.getByRole('textbox', { name: 'Name of Coffee' }),
  ).toBeVisible({ timeout: 2_000 })

  await watching.getByRole('button', { name: 'Request more' }).click()
  await watching.getByLabel('Number of kinds').fill('9')
  await watching.getByRole('button', { name: 'Send request' }).click()
  await expect(watching.getByText('Request for 9 kinds pending')).toBeVisible()

  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await showLocale(admin, 'en')
  await admin.setViewportSize({ width: 1280, height: 900 })
  await login(admin, sven)
  await admin.goto('/admin/requests')
  const item = admin
    .getByTestId('request-item')
    .filter({ has: admin.locator(`a[href="/admin/trips/${tripId}"]`) })
  await item.getByRole('button', { name: 'Approve' }).click()

  await expect(watching.getByTestId('kind-total')).toHaveText('5 of 9 kinds')
  await expect(watching.getByRole('button', { name: 'Add kind' })).toBeEnabled()
  await adminContext.close()
  await otherContext.close()
})

test('T-32-09 kind rows stay on one line at 768 px and the page does not scroll sideways at 375 px @chromium', async ({
  page,
}) => {
  test.setTimeout(30_000)
  await showLocale(page, 'en')
  await page.setViewportSize({ width: 768, height: 1024 })
  await login(page, freshDiscordId())
  const tripId = await createTrip(page)
  await page.goto(`/trips/${tripId}/settings`)
  const section = page.getByTestId('kinds-section')
  const rows = section.getByTestId('kind-row')
  await expect(rows).toHaveCount(4)
  for (let index = 0; index < 4; index++) {
    const row = rows.nth(index)
    const input = (await row.getByRole('textbox').boundingBox())!
    const buttons = row.getByRole('button')
    const count = await buttons.count()
    expect(count).toBeGreaterThanOrEqual(3)
    for (let b = 0; b < count; b++) {
      const box = (await buttons.nth(b).boundingBox())!
      const centre = box.y + box.height / 2
      expect(centre, `row ${index} button ${b}`).toBeGreaterThanOrEqual(input.y)
      expect(centre, `row ${index} button ${b}`).toBeLessThanOrEqual(
        input.y + input.height,
      )
    }
  }

  await page.setViewportSize({ width: 375, height: 667 })
  await expect(rows.first()).toBeVisible()
  const overflow = await page.evaluate(() => ({
    scroll: document.scrollingElement!.scrollWidth,
    inner: window.innerWidth,
  }))
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.inner)
})
