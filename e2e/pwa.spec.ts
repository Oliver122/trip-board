import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

// T-33-08 runs against a production build served by `vite preview`; the
// preview shares the dev server's /api proxy and the browser's cookies.
const webDir = fileURLToPath(new URL('../apps/web', import.meta.url))
const previewPort = 5193
const preview = `http://127.0.0.1:${previewPort}`

test.describe.configure({ mode: 'serial', timeout: 120_000 })

let server: ChildProcess | undefined

test.beforeAll(async () => {
  execFileSync('pnpm', ['exec', 'vite', 'build'], {
    cwd: webDir,
    stdio: 'ignore',
    timeout: 110_000,
  })
  server = spawn(
    'pnpm',
    ['exec', 'vite', 'preview', '--port', String(previewPort), '--strictPort'],
    { cwd: webDir, stdio: 'ignore', detached: true },
  )
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await fetch(`${preview}/manifest.webmanifest`).then(
      (response) => response.ok,
      () => false,
    )
    if (ready) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('vite preview did not start')
})

test.afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
})

test('T-33-08 serves a complete manifest, its icons and a link to it', async ({
  page,
  request,
}) => {
  const response = await request.get(`${preview}/manifest.webmanifest`)
  expect(response.ok()).toBe(true)
  const manifest = (await response.json()) as Record<string, unknown> & {
    icons: { src: string; sizes: string; purpose?: string }[]
  }
  expect(manifest).toMatchObject({
    start_url: '/trips',
    display: 'standalone',
    share_target: {
      action: '/share',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    },
  })
  for (const key of ['name', 'short_name', 'theme_color', 'background_color']) {
    expect(typeof manifest[key], key).toBe('string')
  }
  const icons = manifest.icons
  expect(icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  )
  expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  for (const icon of icons) {
    const file = await request.get(`${preview}${icon.src}`)
    expect(file.ok(), icon.src).toBe(true)
    expect(file.headers()['content-type']).toContain('image/png')
  }

  await page.goto(`${preview}/`)
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  )
})

test('T-33-08 registers a service worker that leaves /api uncached', async ({
  page,
}) => {
  await page.goto('/login')
  await login(page, '100000000000000002')
  const tripId = await createTrip(page, 'Pwa trip')
  const spotId = await createSpot(page, tripId, 'Before')

  await page.goto(`${preview}/trips`)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration()
        return registration?.active?.state ?? null
      }),
    )
    .toBe('activated')
  await page.reload()
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller !== null),
    )
    .toBe(true)

  expect(await spotTitle(page, tripId)).toBe('Before')
  // The change is made from the dev origin; the preview page must see it.
  const writer = await page.context().newPage()
  await writer.goto('/login')
  await writer.evaluate(async (id) => {
    const response = await fetch(`/api/spots/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'After' }),
    })
    if (!response.ok) throw new Error(await response.text())
  }, spotId)
  await writer.close()
  await page.reload()
  expect(await spotTitle(page, tripId)).toBe('After')
})

function spotTitle(page: Page, tripId: string) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/trips/${id}/spots`, {
      credentials: 'include',
    })
    const body = (await response.json()) as { spots: { title: string }[] }
    return body.spots[0]?.title ?? null
  }, tripId)
}

async function login(page: Page, discordId: string) {
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

async function createTrip(page: Page, name: string) {
  return page.evaluate(async (tripName) => {
    const response = await fetch('/api/trips', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: tripName,
        timezone: 'Asia/Tokyo',
        region: {
          bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 },
        },
      }),
    })
    if (!response.ok) throw new Error(await response.text())
    return ((await response.json()) as { id: string }).id
  }, name)
}

async function createSpot(page: Page, tripId: string, title: string) {
  return page.evaluate(
    async ({ id, spotTitle }) => {
      const response = await fetch(`/api/trips/${id}/spots`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: spotTitle,
          lat: 35.01,
          lng: 135.76,
          baseCategory: 'maybe',
          address: 'Kyoto',
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      return ((await response.json()) as { id: string }).id
    },
    { id: tripId, spotTitle: title },
  )
}
