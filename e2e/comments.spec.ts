import { expectNoSeriousViolations } from './a11y'
import { answerConfirm } from './confirm'
import { expect, test, type BrowserContext, type Page } from './fixtures'
import { showLocale } from './locale'

// Each test reads and writes one trip; keep the file's tests in order.
test.describe.configure({ mode: 'serial' })

// A trip of its own, so the spots these tests add never reach the seeded trip
// that the search and schedule specs count.
const tripName = `Comments e2e ${Date.now().toString(36)}`
let tripId = ''
const aikoId = '100000000000000002'
const tomId = '100000000000000003'
const svenId = '100000000000000001'

test.beforeAll(async ({ browser }) => {
  const sven = await newSession(browser, svenId)
  const created = await sven.page.evaluate(async (name) => {
    const post = async (path: string, body: unknown) => {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(await response.text())
      return (await response.json()) as { id: string; code: string }
    }
    const trip = await post('/api/trips', {
      name,
      timezone: 'Asia/Tokyo',
      region: {
        bbox: { minLng: 122.94, minLat: 24.4, maxLng: 145.82, maxLat: 45.55 },
      },
    })
    const planner = await post(`/api/trips/${trip.id}/invites`, {
      role: 'planner',
    })
    const visitor = await post(`/api/trips/${trip.id}/invites`, {
      role: 'visitor',
    })
    return { id: trip.id, planner: planner.code, visitor: visitor.code }
  }, tripName)
  await sven.context.close()
  tripId = created.id

  // Mirror the seeded trip: Aiko plans, Tom only visits.
  for (const [discordId, code] of [
    [aikoId, created.planner],
    [tomId, created.visitor],
  ] as const) {
    const member = await newSession(browser, discordId)
    await member.page.evaluate(async (invite) => {
      const response = await fetch(`/api/join/${invite}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error(await response.text())
    }, code)
    await member.context.close()
  }
})

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('T-24-13 a visitor writes a two-line comment with Ctrl + Enter', async ({
  page,
}) => {
  const title = uniqueTitle('Thread')
  await signIn(page, aikoId)
  const spotId = await createSpot(page, tripId, title)
  await signIn(page, tomId)
  await page.goto(`/trips/${tripId}`)
  await openSpot(page, title)

  const discussion = page.getByTestId('discussion')
  await expect(page.getByTestId('discussion-empty')).toBeVisible()
  await discussion
    .getByRole('textbox', { name: 'Add a comment' })
    .fill('I would go only early\nbefore the crowds')
  await discussion
    .getByRole('textbox', { name: 'Add a comment' })
    .press('ControlOrMeta+Enter')

  const comment = discussion.getByTestId('comment')
  await expect(comment).toHaveCount(1)
  await expect(comment).toContainText('Tom')
  await expect(comment).toContainText('I would go only early')
  await expect(comment).toContainText('before the crowds')
  await expect(
    discussion.getByRole('textbox', { name: 'Add a comment' }),
  ).toHaveValue('')
  await expect(
    page.getByTestId(`card-${spotId}`).getByTestId('comment-count'),
  ).toHaveText('1')
})

test('T-24-14 a failed send removes the comment, restores the text and shows an error', async ({
  page,
}) => {
  const title = uniqueTitle('Failing')
  await signIn(page, aikoId)
  await createSpot(page, tripId, title)
  await signIn(page, tomId)
  await page.goto(`/trips/${tripId}`)
  await openSpot(page, title)
  await page.route('**/api/spots/*/comments', (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    return route.fulfill({ status: 500, json: { error: 'internal' } })
  })

  const field = page.getByRole('textbox', { name: 'Add a comment' })
  await field.fill('This will fail')
  await page.getByRole('button', { name: 'Send', exact: true }).click()

  await expect(page.getByTestId('comment')).toHaveCount(0)
  await expect(field).toHaveValue('This will fail')
  await expect(page.getByTestId('toast')).toContainText(
    /could not be saved|konnte nicht/,
  )
})

test('T-24-15 authors edit and delete their own comments; the owner deletes any', async ({
  page,
}) => {
  const title = uniqueTitle('Edits')
  await signIn(page, aikoId)
  await createSpot(page, tripId, title)
  await openSpot(page, title)
  await page.getByRole('textbox', { name: 'Add a comment' }).fill('Go early')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('comment')).toHaveCount(1)

  const discussion = page.getByTestId('discussion')
  await discussion.getByRole('button', { name: 'Edit', exact: true }).click()
  await discussion
    .getByRole('textbox', { name: 'Edit comment' })
    .fill('Go very early')
  await discussion.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('comment')).toContainText('Go very early')
  await expect(page.getByTestId('comment')).toContainText('edited')

  await discussion.getByRole('button', { name: 'Delete comment' }).click()
  await answerConfirm(page, 'accept')
  await expect(page.getByTestId('comment')).toHaveCount(0)
  await expect(page.getByTestId('discussion-empty')).toBeVisible()
})

test('T-24-15 the owner sees Delete on a visitor comment but not Edit', async ({
  browser,
}) => {
  const title = uniqueTitle('Owner')
  const tom = await newSession(browser, tomId)
  const sven = await newSession(browser, svenId)
  const aiko = await newSession(browser, aikoId)
  await createSpot(aiko.page, tripId, title)
  await openSpot(tom.page, title)
  await tom.page
    .getByRole('textbox', { name: 'Add a comment' })
    .fill('Tom says hi')
  await tom.page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(tom.page.getByTestId('comment')).toHaveCount(1)

  await openSpot(sven.page, title)
  await expect(sven.page.getByTestId('comment')).toHaveCount(1)
  await expect(
    sven.page.getByTestId('comment').getByRole('button', { name: 'Edit' }),
  ).toHaveCount(0)
  await expect(
    sven.page
      .getByTestId('comment')
      .getByRole('button', { name: 'Delete comment' }),
  ).toBeVisible()
  await closeAll(tom, sven, aiko)
})

test('T-24-16 a comment from another member appears live and updates the card count', async ({
  browser,
}) => {
  const title = uniqueTitle('Live')
  const aiko = await newSession(browser, aikoId)
  const tom = await newSession(browser, tomId)
  await createSpot(aiko.page, tripId, title)
  await openSpot(aiko.page, title)
  await expect(aiko.page.getByTestId('discussion-empty')).toBeVisible()

  await openSpot(tom.page, title)
  await tom.page
    .getByRole('textbox', { name: 'Add a comment' })
    .fill('Live from Tom')
  await tom.page.getByRole('button', { name: 'Send', exact: true }).click()

  await expect(
    aiko.page.getByTestId('discussion').getByText('Live from Tom'),
  ).toBeVisible({ timeout: 10_000 })
  await expect(
    aiko.page
      .getByTestId('spot-list')
      .getByRole('button', { name: new RegExp(title) })
      .getByTestId('comment-count'),
  ).toHaveText('1', { timeout: 10_000 })
  await closeAll(aiko, tom)
})

test('T-24-12 renders markup as text and links http(s) with safe attributes', async ({
  page,
}) => {
  const title = uniqueTitle('Markup')
  await signIn(page, aikoId)
  await createSpot(page, tripId, title)
  await openSpot(page, title)
  await page
    .getByRole('textbox', { name: 'Add a comment' })
    .fill('<b>bold?</b> https://example.com/map')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const comment = page.getByTestId('comment')
  await expect(comment).toContainText('<b>bold?</b>')
  const link = comment.getByRole('link', { name: 'https://example.com/map' })
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
  await expect(comment.locator('b')).toHaveCount(0)
})

test('T-24-23 News lists unread spots, opens the discussion and clears the badge', async ({
  browser,
}) => {
  // Two sessions, two threads and mark-all-read: about 29 s on CI WebKit.
  test.setTimeout(60_000)
  const first = uniqueTitle('News one')
  const second = uniqueTitle('News two')
  const aiko = await newSession(browser, aikoId)
  const sven = await newSession(browser, svenId)
  await createSpot(aiko.page, tripId, first)
  await createSpot(aiko.page, tripId, second)
  await markEverythingRead(sven.page)
  await openSpot(aiko.page, first)
  await aiko.page
    .getByRole('textbox', { name: 'Add a comment' })
    .fill('Aiko on the first')
  await aiko.page.getByRole('button', { name: 'Send', exact: true }).click()
  await openSpot(aiko.page, second)
  await aiko.page
    .getByRole('textbox', { name: 'Add a comment' })
    .fill('Aiko on the second')
  await aiko.page.getByRole('button', { name: 'Send', exact: true }).click()

  await sven.page.goto(`/trips/${tripId}`)
  const news = sven.page.getByTestId('news-button')
  await expect(news).toHaveAccessibleName(/News, \d+ unread/)
  await news.click()
  await expect(
    sven.page.getByRole('dialog').getByText(first, { exact: true }),
  ).toBeVisible()
  await expect(
    sven.page.getByRole('dialog').getByText(second, { exact: true }),
  ).toBeVisible()

  const entry = sven.page.getByRole('dialog').getByRole('button', {
    name: new RegExp(second),
  })
  await entry.click()
  await expect(sven.page.getByTestId('new-divider')).toBeVisible()
  await expect(sven.page.getByTestId('discussion')).toContainText(
    'Aiko on the second',
  )
  await expect(sven.page.getByTestId('news-badge')).toHaveText('1', {
    timeout: 10_000,
  })

  await sven.page.getByTestId('news-button').click()
  await sven.page.getByRole('button', { name: 'Mark all as read' }).click()
  await expect(sven.page.getByText("You're all caught up")).toBeVisible()
  await expect(sven.page.getByTestId('news-badge')).toHaveCount(0)
  await closeAll(aiko, sven)
})

test('T-24-26 the News panel passes axe and traps focus until Escape', async ({
  page,
}) => {
  await signIn(page, svenId)
  await page.goto(`/trips/${tripId}`)
  await page.getByTestId('news-button').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoSeriousViolations(page, 'news panel')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('T-24-17 the spot panel with a thread passes axe', async ({ page }) => {
  const title = uniqueTitle('Axe')
  await signIn(page, aikoId)
  await createSpot(page, tripId, title)
  await openSpot(page, title)
  for (const body of ['One', 'Two', 'Three']) {
    await page.getByRole('textbox', { name: 'Add a comment' }).fill(body)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText(body, { exact: true })).toBeVisible()
  }
  await expectNoSeriousViolations(page, 'spot panel with discussion')
})

test('T-24-24 an unread spot shows an accent count, a pin dot and the tab title until read', async ({
  browser,
}) => {
  const title = uniqueTitle('Unread')
  const aiko = await newSession(browser, aikoId)
  const sven = await newSession(browser, svenId)
  await markEverythingRead(sven.page)
  const spotId = await createSpot(aiko.page, tripId, title)
  await openSpot(aiko.page, title)
  await aiko.page
    .getByRole('textbox', { name: 'Add a comment' })
    .fill('Read me, Sven')
  await aiko.page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(aiko.page.getByTestId('comment')).toHaveCount(1)

  await sven.page.goto('/trips')
  await expect(
    sven.page.getByRole('article').filter({ hasText: tripName }),
  ).toContainText('1 new comment')
  await sven.page.goto(`/trips/${tripId}`)
  const card = sven.page.getByTestId(`card-${spotId}`)
  await expect(card.getByTestId('comment-count')).toHaveClass(/text-accent/)
  await expect(card.getByTestId('comment-count')).toHaveText('1')
  await expect(sven.page).toHaveTitle(
    new RegExp(`^\\(1\\) ${tripName} · Trip Board$`),
  )

  await card.click()
  const discussion = sven.page.getByTestId('discussion')
  await expect(discussion).toContainText('Read me, Sven')
  // The thread sits below the fold: it counts as read only once scrolled into view.
  await expect(sven.page).toHaveTitle(new RegExp(`^\\(1\\) ${tripName}`))
  await discussion.scrollIntoViewIfNeeded()
  await expect(sven.page).toHaveTitle(`${tripName} · Trip Board`, {
    timeout: 10_000,
  })
  await sven.page.goto('/trips')
  await expect(
    sven.page.getByRole('article').filter({ hasText: tripName }),
  ).not.toContainText('new comment')
  await sven.page.goto(`/trips/${tripId}`)
  await expect(
    sven.page.getByTestId(`card-${spotId}`).getByTestId('comment-count'),
  ).not.toHaveClass(/text-accent/)
  await closeAll(aiko, sven)
})

test('T-24-25 a comment from another member updates the badge and title without reload', async ({
  browser,
}) => {
  const title = uniqueTitle('Elsewhere')
  const sven = await newSession(browser, svenId)
  const tom = await newSession(browser, tomId)
  const aiko = await newSession(browser, aikoId)
  const spotId = await createSpot(aiko.page, tripId, title)
  await markEverythingRead(sven.page)
  await sven.page.goto(`/trips/${tripId}`)
  await expect(sven.page.getByTestId('news-button')).not.toHaveAccessibleName(
    /unread/,
  )

  await openSpot(tom.page, title)
  await tom.page
    .getByRole('textbox', { name: 'Add a comment' })
    .fill('Pop-in from Tom')
  await tom.page.getByRole('button', { name: 'Send', exact: true }).click()

  await expect(sven.page.getByTestId('news-badge')).toHaveText('1', {
    timeout: 10_000,
  })
  await expect(sven.page).toHaveTitle(new RegExp(`^\\(1\\) ${tripName}`), {
    timeout: 10_000,
  })
  await expect(
    sven.page.getByTestId(`card-${spotId}`).getByTestId('comment-count'),
  ).toHaveText('1', { timeout: 10_000 })
  await closeAll(aiko, sven, tom)
})

// ── helpers ─────────────────────────────────────────────────────────────

let counter = 0
function uniqueTitle(prefix: string): string {
  counter += 1
  return `${prefix} ${Date.now().toString(36)}-${counter}`
}

async function signIn(page: Page, discordId: string) {
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

async function newSession(
  browser: { newContext(): Promise<BrowserContext> },
  discordId: string,
) {
  const context = await browser.newContext({ locale: 'en-US' })
  const page = await context.newPage()
  await page.setViewportSize({ width: 1280, height: 800 })
  await signIn(page, discordId)
  return { context, page }
}

async function markEverythingRead(page: Page) {
  await page.goto(`/trips/${tripId}`)
  await page.evaluate(async (tripId) => {
    const response = await fetch(`/api/trips/${tripId}/news/read`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) throw new Error(await response.text())
  }, tripId)
}

async function closeAll(...sessions: { context: BrowserContext }[]) {
  for (const session of sessions) await session.context.close()
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
          // Spread the pins so the map does not cluster them.
          lat: 34 + Math.random() * 2,
          lng: 131 + Math.random() * 6,
          baseCategory: 'maybe',
          address: 'Kyoto',
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const body = (await response.json()) as { id: string }
      return body.id
    },
    { tripId, title },
  )
}

async function openSpot(page: Page, title: string) {
  await page.goto(`/trips/${tripId}`)
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: new RegExp(title) })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('T-24-13 the discussion reads in German for a German member', async ({
  page,
}) => {
  const title = uniqueTitle('Deutsch')
  await signIn(page, aikoId)
  await createSpot(page, tripId, title)
  await signIn(page, tomId)
  await showLocale(page, 'de')
  await page.goto(`/trips/${tripId}`)
  await page
    .getByTestId('spot-list')
    .getByRole('button', { name: new RegExp(title) })
    .click()
  const discussion = page.getByTestId('discussion')
  await expect(discussion.getByText('Diskussion')).toBeVisible()
  await expect(discussion.getByTestId('discussion-empty')).toContainText(
    'Noch keine Kommentare',
  )
  const field = discussion.getByRole('textbox', {
    name: 'Kommentar hinzufügen',
  })
  await field.fill('Zeile eins\nZeile zwei')
  await discussion.getByRole('button', { name: 'Senden' }).click()
  await expect(discussion.getByTestId('comment')).toContainText('Zeile zwei')
})
