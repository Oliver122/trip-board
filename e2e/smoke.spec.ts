import { expect, test } from '@playwright/test'

// T-00-04
test('placeholder page can reach the api health check', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Trip Board' })).toBeVisible()

  const result = await page.evaluate(async () => {
    const response = await fetch('/api/health')
    const body = (await response.json()) as { status: string; db: string }
    return { status: response.status, body }
  })

  expect(result.body.status).toBe('ok')
  expect(['ok', 'down']).toContain(result.body.db)
  if (process.env.REQUIRE_DB === '1') {
    expect(result.status).toBe(200)
    expect(result.body.db).toBe('ok')
  }

  await expect(page.getByTestId('health')).toHaveText(/api ok|api down/, {
    timeout: 15_000,
  })
})
