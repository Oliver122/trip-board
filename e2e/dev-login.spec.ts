import { type ChildProcess, spawn } from 'node:child_process'
import { mkdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y'

// 5180 belongs to the flag-off server. This origin must match WEB_ORIGIN.
const webPort = 5181
const origin = `http://127.0.0.1:${webPort}`

// The browsers' dev-login runs share the ports and Sven's account, so they take
// turns. A lock older than the test timeout is left over from a killed run.
const lock = join(tmpdir(), 'trip-board-dev-login.lock')

async function acquireLock() {
  for (;;) {
    try {
      await mkdir(lock)
      return
    } catch {
      const age = await stat(lock).then(
        (info) => Date.now() - info.mtimeMs,
        () => 0,
      )
      if (age > 120_000) await rm(lock, { recursive: true, force: true })
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}

test.describe('dev login on', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  test.use({ baseURL: origin })

  let child: ChildProcess | undefined
  let logs = ''

  test.beforeAll(async () => {
    await acquireLock()
    child = spawn('pnpm', ['dev:local'], {
      env: {
        ...process.env,
        WEB_PORT: String(webPort),
        API_PORT: '4081',
        WEB_ORIGIN: origin,
        DEV_LOGIN: '1',
        NODE_ENV: 'development',
      },
      detached: true,
      stdio: 'pipe',
    })
    const push = (chunk: Buffer) => {
      logs = (logs + chunk.toString()).slice(-8000)
    }
    child.stdout?.on('data', push)
    child.stderr?.on('data', push)
    const deadline = Date.now() + 90_000
    let last = 'not started'
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${origin}/api/auth/dev/users`)
        if (response.status === 200) return
        last = String(response.status)
      } catch (error) {
        last = error instanceof Error ? error.message : String(error)
      }
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    throw new Error(`dev login server did not start (${last})\n${logs}`)
  })

  test.afterAll(async () => {
    try {
      if (!child?.pid) return
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }
    } finally {
      await rm(lock, { recursive: true, force: true })
    }
  })

  test('T-22-08 signs in as Sven from the login page in English and German', async ({
    page,
  }) => {
    try {
      await signIn(page, 'en')
      await page.context().clearCookies()
      await signIn(page, 'de')
    } finally {
      // The request context shares the page's cookies but not its navigation
      // state, so the reset survives a page that is mid-load or errored.
      await page.request.patch('/api/me', { data: { locale: 'en' } })
    }
  })
})

test('T-22-09 hides dev login when the API flag is off', async ({ page }) => {
  await page.goto('/login')
  await expect(
    page.getByRole('link', { name: 'Continue with Discord' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dev login' })).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Dev-Anmeldung' }),
  ).toHaveCount(0)
  await expect(page.getByTestId('dev-login-badge')).toHaveCount(0)
})

// These flip Sven's stored language too, so they live in this isolated spec
// instead of the admin and insights ones. Axe is engine-agnostic, so one
// browser is enough.
test.describe('German admin pages', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(({ browserName }) => browserName !== 'chromium')

  test.afterEach(async ({ page }) => {
    await page.request.patch('/api/me', { data: { locale: 'en' } })
  })

  test('T-16-16 admin pages pass axe in German', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAsGerman(page)
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'Nutzer' })).toBeVisible()
    await expectNoSeriousViolations(page)
  })

  test('T-17-15 storage passes axe in German', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAsGerman(page)
    await page.goto('/admin/storage')
    await expect(page.getByRole('heading', { name: 'Speicher' })).toBeVisible()
    await expectNoSeriousViolations(page)
  })
})

async function loginAsGerman(page: Page) {
  await page.goto('/login')
  await page.evaluate(async (id) => {
    const response = await fetch('/api/test/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ discordId: id }),
    })
    if (!response.ok) throw new Error(await response.text())
    const patch = await fetch('/api/me', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'de' }),
    })
    if (!patch.ok) throw new Error(await patch.text())
  }, '100000000000000001')
}

async function signIn(page: Page, locale: 'en' | 'de') {
  const copy =
    locale === 'en'
      ? {
          title: 'Dev login',
          badge: 'Dev login',
          dashboard: 'Dashboard',
          language: 'EN',
        }
      : {
          title: 'Dev-Anmeldung',
          badge: 'Dev-Anmeldung',
          dashboard: 'Übersicht',
          language: 'DE',
        }

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin/)
  await page.getByRole('button', { name: copy.language, exact: true }).click()
  await expect(page.getByRole('heading', { name: copy.title })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sven (admin)' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Aiko', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Tom', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('banner').getByText(copy.badge, { exact: true }),
  ).toBeVisible()
  await expectNoSeriousViolations(page)
  await shot(page, `dev-login-${locale}-1280`)

  await page.setViewportSize({ width: 768, height: 1024 })
  await shot(page, `dev-login-${locale}-768`)
  await expectNoSeriousViolations(page)
  await page.setViewportSize({ width: 1280, height: 800 })

  await page.getByRole('button', { name: 'Sven (admin)' }).click()
  await expect(page).toHaveURL(/\/admin\/?$/)
  // The profile locale outranks the toggle, and other specs flip Sven's, so
  // pin it for both languages instead of trusting what the account holds.
  await page.evaluate(async (next) => {
    const response = await fetch('/api/me', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    })
    if (!response.ok) throw new Error(await response.text())
  }, locale)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: copy.dashboard }),
  ).toBeVisible()
  await expect(
    page.getByRole('banner').getByText(copy.badge, { exact: true }),
  ).toBeVisible()
  await expectNoSeriousViolations(page)
}

async function shot(page: Page, name: string) {
  const image = await page.screenshot()
  await test.info().attach(name, { body: image, contentType: 'image/png' })
}
