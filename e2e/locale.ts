import type { Page } from '@playwright/test'

// Shows this page in a language without writing it to the account. The
// seeded users (sven, aiko, tom) are shared by specs that run in parallel, so
// storing German on one of them turns another test's page German mid-run.
// The app takes its language from `GET /api/me`, so rewriting that response
// for this page alone is enough. Call it before the first navigation.
export async function showLocale(page: Page, locale: 'en' | 'de') {
  await page.route('**/api/me', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const response = await route.fetch()
    if (!response.ok()) return route.fulfill({ response })
    const user = (await response.json()) as Record<string, unknown>
    await route.fulfill({ response, json: { ...user, locale } })
  })
}
