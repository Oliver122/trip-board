import { expect, test, type Page } from '@playwright/test'
import { showLocale } from './locale'
import { freshUser, login } from './low-data'

const sven = '100000000000000001'

async function edge(page: Page, testId: string) {
  const heading = await page
    .getByTestId(testId)
    .getByRole('heading')
    .boundingBox()
  return heading?.x ?? -1
}

async function centre(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox()
  return box ? box.x + box.width / 2 : -1
}

test('T-42-14 the admin notice is the shared empty state under the one-row header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await showLocale(page, 'en')
  await login(page, sven)
  await page.goto('/admin')
  const notice = page.getByTestId('admin-phone-notice')
  await expect(notice).toContainText('The admin area needs a larger screen.')
  const header = page.locator('header')
  expect((await header.boundingBox())?.height).toBeLessThanOrEqual(56)
  await expect(
    header.getByRole('button', { name: 'Account menu' }),
  ).toBeVisible()
  const button = notice.getByRole('link', { name: 'My trips' })
  expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  expect(await edge(page, 'admin-phone-notice')).toBe(16)
})

test('T-42-14 not-found and the invalid invite share one block', async ({
  page,
}) => {
  await login(page, freshUser())
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/no-such-page')
  await expect(page.getByTestId('not-found')).toBeVisible()
  const notFoundEdge = await edge(page, 'not-found')
  const backHome = page.getByRole('link', { name: 'Back home' })
  expect((await backHome.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await page.goto('/join/nosuchcode')
  await expect(page.getByTestId('join-invalid')).toBeVisible()
  await expect(page.getByText('This invite link is not valid.')).toBeVisible()
  await expect(
    page.getByText('Ask the person who invited you for a new link.'),
  ).toBeVisible()
  expect(notFoundEdge).toBe(16)
  expect(await edge(page, 'join-invalid')).toBe(16)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/join/nosuchcode')
  const joinCentre = await centre(page, 'join-invalid')
  await page.goto('/no-such-page')
  const notFoundCentre = await centre(page, 'not-found')
  expect(Math.abs(joinCentre - 640)).toBeLessThanOrEqual(8)
  expect(Math.abs(notFoundCentre - joinCentre)).toBeLessThanOrEqual(1)
})

test('T-42-14 the invalid invite text is translated', async ({ page }) => {
  await showLocale(page, 'de')
  await login(page, freshUser())
  await page.goto('/join/nosuchcode')
  await expect(
    page.getByText('Dieser Einladungslink ist ungültig.'),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Bitte die Person, die dich eingeladen hat, um einen neuen Link.',
    ),
  ).toBeVisible()
})

test('T-42-14 My trips on the invalid invite leads through login when signed out', async ({
  page,
}) => {
  await page.goto('/join/nosuchcode')
  await page.getByRole('link', { name: 'My trips' }).click()
  await expect(page).toHaveURL(/\/login/)
})

async function expectHugging(page: Page, name: string) {
  const group = page.getByRole('group', { name })
  await expect(group).toBeVisible()
  const buttons = group.getByRole('button')
  const count = await buttons.count()
  let total = 0
  for (let index = 0; index < count; index++) {
    const box = await buttons.nth(index).boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
    total += box?.width ?? 0
  }
  const width = (await group.boundingBox())?.width ?? 0
  expect(Math.abs(width - total)).toBeLessThanOrEqual(2)
}

test('T-42-15 the language control hugs its buttons and the login card fits', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await expectHugging(page, 'Language')
  const card = await page.locator('main').boundingBox()
  expect((card?.width ?? 0) - 32).toBe(358)
  const discord = await page
    .getByRole('link', { name: 'Continue with Discord' })
    .boundingBox()
  expect(Math.round(discord?.width ?? 0)).toBe(358)
})

test('T-42-15 language and theme controls on the account page hug their buttons', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, freshUser())
  await page.goto('/account')
  await expectHugging(page, 'Language')
  await expectHugging(page, 'Theme')
})
