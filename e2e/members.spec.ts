import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('T-13-11 a logged-out visitor joins from a copied invite and sees a read-only board', async ({
  page,
  browser,
}) => {
  await login(page, freshDiscordId())
  const tripId = await createJapan(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/trips/${tripId}`)
  await page.getByRole('button', { name: 'Members' }).click()
  const dialog = page.getByRole('dialog', { name: 'Members' })
  await expect(dialog.getByRole('combobox', { name: 'Role' })).toHaveValue(
    'visitor',
  )
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog.getByTestId('invite-role')).toHaveText('Visitor')
  await expect(dialog.getByText('expires in 7 days')).toBeVisible()
  const code = (await dialog.getByTestId('invite-code').textContent()) ?? ''
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toBe(`${new URL(page.url()).origin}/join/${code}`)
  await shot(page, 'members-1280')
  await expectNoSeriousViolations(page)

  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, 'members-768')
  await expectNoSeriousViolations(page)

  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  await guestPage.setViewportSize({ width: 1280, height: 800 })
  await guestPage.goto(copied)
  const discord = guestPage.getByRole('link', { name: 'Continue with Discord' })
  await expect(discord).toBeVisible()
  await expect(discord).toHaveAttribute(
    'href',
    `/api/auth/discord?next=${encodeURIComponent(`/join/${code}`)}`,
  )
  await shot(guestPage, 'join-1280')
  await expectNoSeriousViolations(guestPage)
  await guestPage.setViewportSize({ width: 768, height: 1024 })
  await shot(guestPage, 'join-768')

  await login(guestPage, freshDiscordId())
  await guestPage.goto(copied)
  await guestPage.getByRole('button', { name: 'Join trip' }).click()
  await expect(guestPage).toHaveURL(new RegExp(`/trips/${tripId}$`))
  await expect(guestPage.getByText('No spots yet')).toBeVisible()
  await expect(guestPage.getByTestId('add-new')).toHaveCount(0)
  await guest.close()
})

test('T-13-12 an expired invite explains itself in English and German', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/join/JPN-EXP1')
  await expect(
    page.getByText(
      'This invite has expired. Ask the trip owner for a new link.',
    ),
  ).toBeVisible()
  await shot(page, 'join-expired-1280')
  await expectNoSeriousViolations(page)

  await page.getByRole('button', { name: 'DE' }).click()
  await expect(
    page.getByText(
      'Diese Einladung ist abgelaufen. Bitte den Reise-Owner um einen neuen Link.',
    ),
  ).toBeVisible()

  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, 'join-expired-768')
  await expectNoSeriousViolations(page)
})

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

async function createJapan(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/trips', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Japan 2026',
        timezone: 'Asia/Tokyo',
        region: {
          bbox: { minLng: 122.94, minLat: 24.4, maxLng: 145.82, maxLat: 45.55 },
        },
      }),
    })
    if (!response.ok) throw new Error(await response.text())
    const body = (await response.json()) as { id: string }
    return body.id
  })
}

async function shot(page: Page, name: string) {
  const image = await page.screenshot()
  await test.info().attach(name, { body: image, contentType: 'image/png' })
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious).toEqual([])
}
