import { expect, test, type Page } from './fixtures'
import { waitForMap } from './map'

const seedTrip = '10000000-0000-0000-0000-000000000001'
const shareUrl = 'https://maps.app.goo.gl/kinkaku'
const shareText = `Kinkaku-ji\n1 Kinkakujicho, Kita Ward, Kyoto\n${shareUrl}`
const sharePath = `/share?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('T-33-07 a signed-out visitor goes through login and comes back to /share', async ({
  page,
}) => {
  await page.goto(sharePath)
  await expect(page).toHaveURL(/\/login\?next=%2Fshare%3Ftext%3D/)
  const next = new URL(page.url()).searchParams.get('next')
  expect(next).toBe(sharePath)
  await login(page, '100000000000000002')
  await page.goto(next ?? '/')
  await expect(page).toHaveURL(/\/share\?/)
  await expect(
    page.getByRole('group', { name: 'Add to which trip?' }),
  ).toBeVisible()
})

test('T-33-07 preselects the last board and continues to the filled add panel', async ({
  page,
}) => {
  await fakeResolver(page)
  await login(page, '100000000000000002')
  await setLocale(page, 'en')
  await page.goto(`/trips/${seedTrip}`)
  await waitForMap(page)

  await page.goto(sharePath)
  const japan = page.getByRole('radio', { name: 'Japan 2026' })
  await expect(japan).toBeChecked()
  await page.getByRole('button', { name: 'Continue' }).click()

  await waitForMap(page)
  const dialog = page.getByRole('dialog', { name: 'New spot' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Title')).toHaveValue('Kinkaku-ji')
  await expect(page).toHaveURL(new RegExp(`/trips/${seedTrip}(#.*)?$`))
})

test('T-33-07 a user without a writable trip is told so and pointed to /trips', async ({
  page,
}) => {
  // A fresh account: other specs turn the seeded visitor into a planner.
  await login(page, `2${String(Date.now()).padStart(17, '0')}`)
  await setLocale(page, 'en')
  await page.goto(sharePath)
  await expect(
    page.getByText('You have no trip you can add spots to'),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Go to my trips' }),
  ).toHaveAttribute('href', '/trips')
})

test('T-33-07 as a visitor the board drops addFrom and opens nothing', async ({
  page,
}) => {
  const lookups = await fakeResolver(page)
  await login(page, '100000000000000003')
  await setLocale(page, 'en')
  await page.goto(
    `/trips/${seedTrip}?addFrom=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
  )
  await waitForMap(page)
  await expect(page).toHaveURL(new RegExp(`/trips/${seedTrip}(#.*)?$`))
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(lookups()).toBe(0)
})

async function fakeResolver(page: Page): Promise<() => number> {
  let calls = 0
  await page.route('**/api/trips/*/places/from-link', async (route) => {
    calls += 1
    await route.fulfill({
      json: {
        title: 'Kinkaku-ji',
        address: '1 Kinkakujicho, Kita Ward, Kyoto',
        lat: 35.0394,
        lng: 135.7292,
        link: shareUrl,
        placed: true,
      },
    })
  })
  await page.route('**/api/geocode/reverse**', (route) =>
    route.fulfill({ json: { label: 'Kyoto, Japan', lat: 35, lng: 135.75 } }),
  )
  return () => calls
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
