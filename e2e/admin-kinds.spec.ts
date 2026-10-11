import { expectNoSeriousViolations } from './a11y'
import { expect, test, type Page } from './fixtures'
import { showLocale } from './locale'

const sven = '100000000000000001'

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

async function createTrip(page: Page) {
  await page.goto('/login')
  await api(page, 'POST', '/test/login', { discordId: sven })
  const trip = await api<{ id: string }>(page, 'POST', '/trips', {
    name: `Kind limit ${Date.now()}`,
    timezone: 'Asia/Tokyo',
    region: { bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 } },
  })
  return trip.id
}

const tripName = 'Kind limit fixture'
const requestId = '40000000-0000-4000-8000-000000000001'

/**
 * Serves one pending kind request to the Requests page without writing it to
 * the shared database: other specs count pending requests (T-16-14).
 */
async function mockKindRequests(page: Page) {
  const decisions: unknown[] = []
  await page.route('**/api/admin/kind-limit-requests**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      decisions.push(request.postDataJSON())
      return route.fulfill({ json: { ok: true } })
    }
    const status = new URL(request.url()).searchParams.get('status')
    await route.fulfill({
      json: {
        requests:
          status === 'pending' || status === null
            ? [
                {
                  id: requestId,
                  tripId: '10000000-0000-0000-0000-000000000001',
                  tripName,
                  requestedBy: null,
                  requestedByName: 'Aiko',
                  requestedMax: 14,
                  currentLimit: 12,
                  kindCount: 12,
                  message: 'More food kinds please',
                  status: 'pending',
                  decisionNote: null,
                  decidedBy: null,
                  decidedAt: null,
                  createdAt: '2026-10-11T08:00:00.000Z',
                },
              ]
            : [],
        pendingCount: 1,
        nextCursor: null,
      },
    })
  })
  return decisions
}

test.beforeEach(async ({ page }) => {
  await showLocale(page, 'en')
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('T-29-23 the admin Requests page passes axe in light and dark mode', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.goto('/login')
  await api(page, 'POST', '/test/login', { discordId: sven })
  await mockKindRequests(page)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/admin/requests')
    const item = page.getByTestId('request-item').filter({ hasText: tripName })
    await expect(item).toBeVisible()
    await expect(item.getByTestId('request-type')).toHaveText('Spot kinds')
    await expectNoSeriousViolations(page, scheme)
  }
})

test('R-29-10 an admin filters by type and approves a kind request with an edited value', async ({
  page,
}) => {
  await page.goto('/login')
  await api(page, 'POST', '/test/login', { discordId: sven })
  const decisions = await mockKindRequests(page)
  await page.goto('/admin/requests')
  const item = page.getByTestId('request-item').filter({ hasText: tripName })
  await expect(item).toBeVisible()
  await page.getByLabel('Filter by type').selectOption('storage')
  await expect(item).toHaveCount(0)
  await page.getByLabel('Filter by type').selectOption('kinds')
  await expect(item.getByLabel('Kinds per trip')).toHaveValue('14')
  await item.getByLabel('Kinds per trip').fill('15')
  await item.getByRole('button', { name: 'Approve' }).click()
  await expect.poll(() => decisions).toEqual([{ maxKinds: 15 }])
})

test('R-29-07 an admin sets and clears the trip override', async ({ page }) => {
  const tripId = await createTrip(page)
  await page.goto(`/admin/trips/${tripId}`)
  await expect(page.getByTestId('kind-limit-source')).toContainText(
    'Platform default',
  )
  await page.getByLabel('Kinds for this trip').fill('20')
  await page.getByRole('button', { name: 'Set override' }).click()
  await expect(page.getByTestId('kind-limit-effective')).toContainText('of 20')
  await expect(page.getByTestId('kind-limit-source')).toContainText('Override')
  await page.getByRole('button', { name: 'Use default' }).click()
  await expect(page.getByTestId('kind-limit-source')).toContainText(
    'Platform default',
  )
})

test('R-29-07 the Settings page has the kinds per trip field', async ({
  page,
}) => {
  await page.goto('/login')
  await api(page, 'POST', '/test/login', { discordId: sven })
  await page.goto('/admin/settings')
  await expect(page.getByLabel('Kinds per trip')).toBeVisible()
})
