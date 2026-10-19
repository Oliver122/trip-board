import { answerConfirm } from './confirm'
import { expect, test, type Page } from './fixtures'
import { showLocale } from './locale'

// Comments are rate limited per user, and the seeded users are shared by every
// parallel spec and project, so each test acts as users of its own.
function freshDiscordId() {
  return `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`.slice(0, 18)
}

test('T-31-08 the spot trash button asks above Cancel and Delete, then removes the spot', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  const tripId = await createTrip(page)
  const spotId = await createSpot(page, tripId, 'Doomed spot')
  for (const body of ['One', 'Two', 'Three']) {
    await createComment(page, spotId, body)
  }
  await page.goto(`/trips/${tripId}?spot=${spotId}`)
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()

  const trash = panel.getByRole('button', { name: 'Delete spot' })
  await expect(trash).toHaveAttribute('title', 'Delete spot')
  await expect(trash).toHaveText('')
  await trash.click()

  const question = panel.getByText('Delete this spot? Also deletes 3 comments.')
  const cancel = panel.getByRole('button', { name: 'Cancel', exact: true })
  const confirm = panel.getByRole('button', { name: 'Delete', exact: true })
  await expect(question).toBeVisible()
  await expect(cancel).toBeVisible()
  await expect(confirm).toBeVisible()
  const q = await boxOf(question)
  const c = await boxOf(cancel)
  const d = await boxOf(confirm)
  expect(q.y + q.height).toBeLessThanOrEqual(Math.min(c.y, d.y) + 1)
  expect(overlap(c, d)).toBe(false)

  await confirm.click()
  await expect(page.getByTestId(`card-${spotId}`)).toHaveCount(0)
  await expect(page.getByTestId(`pin-${spotId}`)).toHaveCount(0)
  await expect(page.getByText('Doomed spot')).toHaveCount(0)
})

test('T-31-09 plan entries and comments are deleted through their trash buttons', async ({
  browser,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, freshDiscordId())
  const { tripId, visitorCode } = await createTripWithVisitorInvite(page)
  const spotId = await createSpot(page, tripId, 'Chatty spot')
  await createComment(page, spotId, 'Soon gone')
  await createBucket(page, tripId, 'Doomed bucket')

  await page.goto(`/trips/${tripId}/schedule`)
  await page.getByRole('button', { name: 'Edit Doomed bucket' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Delete entry' }).click()
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Doomed bucket')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible()
  await expect(page.getByText('Doomed bucket')).toHaveCount(0)

  await page.goto(`/trips/${tripId}?spot=${spotId}`)
  const comment = page.getByTestId('comment')
  await expect(comment).toHaveCount(1)
  await comment.getByRole('button', { name: 'Delete comment' }).click()
  await answerConfirm(page, 'accept')
  await expect(page.getByTestId('comment')).toHaveCount(0)
  await page.goto(`/trips/${tripId}?spot=${spotId}`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByTestId('discussion-empty')).toBeVisible()
  await expect(page.getByTestId('comment')).toHaveCount(0)

  // A visitor sees no trash button on someone else's comment.
  await createComment(page, spotId, 'Planner words')
  const context = await browser.newContext({ locale: 'en-US' })
  const visitor = await context.newPage()
  await visitor.setViewportSize({ width: 1280, height: 800 })
  await login(visitor, freshDiscordId())
  await joinTrip(visitor, visitorCode)
  await visitor.goto(`/trips/${tripId}?spot=${spotId}`)
  await expect(visitor.getByTestId('comment')).toHaveCount(1)
  await expect(
    visitor.getByRole('button', { name: 'Delete comment' }),
  ).toHaveCount(0)
  await context.close()
})

const widths = [1280, 768, 375]
for (const locale of ['en', 'de'] as const) {
  test(`T-31-10 no delete or comment button overflows or overlaps (${locale})`, async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await showLocale(page, locale)
    await page.setViewportSize({ width: 1280, height: 800 })
    await login(page, freshDiscordId())
    const tripId = await createTrip(page)
    const spotId = await createSpot(page, tripId, 'Wide label spot')
    for (const body of ['First comment', 'Second comment', 'Third comment']) {
      await createComment(page, spotId, body)
    }
    await createBucket(page, tripId, 'Bucket with a title')

    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 })
      const label = `${locale} ${width}px`

      await page.goto(`/trips/${tripId}?spot=${spotId}`)
      const panel = page.getByRole('dialog')
      await expect(panel).toBeVisible()
      if (width < 640) {
        // The phone panel keeps these in collapsed sections (R-38-04): open
        // each one in turn and check its buttons, ending on the comments.
        for (const section of ['photos', 'plans', 'comments']) {
          const toggle = page.getByTestId(`section-${section}`)
          await toggle.click()
          await expect(toggle).toHaveAttribute('aria-expanded', 'true')
          await expectButtonsFit(panel, `spot panel ${section} ${label}`)
        }
      }
      await expect(page.getByTestId('comment')).toHaveCount(3)
      await expectButtonsFit(panel, `spot panel ${label}`)
      await expectButtonsFit(
        page.getByTestId('discussion'),
        `comment list ${label}`,
      )
      await page.getByTestId('spot-delete').click()
      await expect(page.getByTestId('spot-delete-confirm')).toBeVisible()
      await expectButtonsFit(panel, `spot panel confirming ${label}`)

      await page.goto(`/trips/${tripId}/schedule`)
      await page
        .locator('[data-testid^="entry-row-"]')
        .getByRole('button', { name: /^Edit |bearbeiten$/ })
        .first()
        .click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expectButtonsFit(dialog, `entry dialog ${label}`)
      await page.getByTestId('entry-delete').click()
      await expect(page.getByTestId('entry-delete-confirm')).toBeVisible()
      await expectButtonsFit(dialog, `entry dialog confirming ${label}`)
    }
  })
}

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: ReturnType<Page['locator']>): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element has no box')
  return box
}

function overlap(a: Box, b: Box) {
  return (
    a.x < b.x + b.width - 0.5 &&
    b.x < a.x + a.width - 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    b.y < a.y + a.height - 0.5
  )
}

// Every visible button inside `root` holds its content and none touches another.
async function expectButtonsFit(
  root: ReturnType<Page['locator']>,
  label: string,
) {
  const problems = await root.evaluate((element) => {
    const found: string[] = []
    const buttons = [...element.querySelectorAll('button')].filter((button) => {
      const rect = button.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return false
      // A button scrolled out of the panel body is clipped, not overlapping.
      const body = button.closest('[data-modal-body]')
      if (body) {
        const view = body.getBoundingClientRect()
        if (rect.bottom > view.bottom + 0.5 || rect.top < view.top - 0.5)
          return false
      }
      return true
    })
    const name = (button: HTMLElement) =>
      button.getAttribute('aria-label') ||
      button.textContent?.trim() ||
      button.getAttribute('data-testid') ||
      'button'
    for (const button of buttons) {
      if (button.scrollWidth > button.clientWidth) {
        found.push(
          `"${name(button)}" content ${button.scrollWidth} > width ${button.clientWidth}`,
        )
      }
    }
    for (let i = 0; i < buttons.length; i += 1) {
      for (let j = i + 1; j < buttons.length; j += 1) {
        const a = buttons[i].getBoundingClientRect()
        const b = buttons[j].getBoundingClientRect()
        if (
          a.left < b.right - 0.5 &&
          b.left < a.right - 0.5 &&
          a.top < b.bottom - 0.5 &&
          b.top < a.bottom - 0.5
        ) {
          found.push(`"${name(buttons[i])}" overlaps "${name(buttons[j])}"`)
        }
      }
    }
    return found
  })
  expect(problems, label).toEqual([])
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

async function postJson<T>(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path: url, body: payload }) => {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await response.text())
      return (await response.json()) as T
    },
    { path, body },
  )
}

let counter = 0
async function createTrip(page: Page) {
  counter += 1
  const trip = await postJson<{ id: string }>(page, '/api/trips', {
    name: `Delete icons ${Date.now().toString(36)}-${counter}`,
    timezone: 'Asia/Tokyo',
    region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
  })
  return trip.id
}

async function createTripWithVisitorInvite(page: Page) {
  const tripId = await createTrip(page)
  const invite = await postJson<{ code: string }>(
    page,
    `/api/trips/${tripId}/invites`,
    { role: 'visitor' },
  )
  return { tripId, visitorCode: invite.code }
}

async function joinTrip(page: Page, code: string) {
  await page.evaluate(async (invite) => {
    const response = await fetch(`/api/join/${invite}`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) throw new Error(await response.text())
  }, code)
}

async function createSpot(page: Page, tripId: string, title: string) {
  const spot = await postJson<{ id: string }>(
    page,
    `/api/trips/${tripId}/spots`,
    {
      title,
      lat: 35.01,
      lng: 135.76,
      baseCategory: 'maybe',
      address: 'Kyoto',
    },
  )
  return spot.id
}

async function createComment(page: Page, spotId: string, body: string) {
  await postJson(page, `/api/spots/${spotId}/comments`, { body })
}

async function createBucket(page: Page, tripId: string, title: string) {
  await postJson(page, `/api/trips/${tripId}/plan`, {
    type: 'bucket',
    title,
    startDate: '2026-04-12',
    endDate: '2026-04-16',
  })
}
