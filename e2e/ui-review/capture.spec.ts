import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { test, type Browser, type Page } from '@playwright/test'
import { showLocale } from '../locale'
import { login } from '../low-data'
import { waitForMapLoaded } from '../map'
import { settle } from '../settle'
import { runChecks, writeChecks } from './checks'
import { screens, sven, viewports, type Screen, type Width } from './screens'

const outDir = path.resolve('test-results/ui-review')

type Variant = { theme: 'light' | 'dark'; locale: 'en' | 'de' }

function variantsFor(width: Width): Variant[] {
  const base: Variant[] = [
    { theme: 'light', locale: 'en' },
    { theme: 'dark', locale: 'en' },
  ]
  return width === 390 ? [...base, { theme: 'light', locale: 'de' }] : base
}

async function step<T>(id: string, what: string, run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`[${id}] ${what} failed: ${message}`)
  }
}

// The first visible loading indicator, or null. The loading strings are those
// of state.loading, account.quotaLoading, spots.imagesLoading and
// photos.suggestionsLoading in the en and de locales.
function loadingIndicator(page: Page) {
  return page.evaluate(() => {
    const shown = (el: Element) => {
      const rect = el.getBoundingClientRect()
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        getComputedStyle(el).visibility === 'visible'
      )
    }
    const text =
      /^(Loading|Wird geladen|Speicher wird geladen|Fotos werden geladen|Vorschläge werden geladen)/
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const own = Array.from(el.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('')
        .trim()
      const marked =
        el.getAttribute('aria-busy') === 'true' ||
        (el.getAttribute('data-testid') ?? '').includes('skeleton') ||
        el.getAttribute('role') === 'progressbar'
      if ((marked || text.test(own)) && shown(el)) {
        return `${el.tagName.toLowerCase()}${
          el.getAttribute('data-testid')
            ? `[data-testid="${el.getAttribute('data-testid')}"]`
            : ''
        } ${own}`.trim()
      }
    }
    return null
  })
}

async function noLoading(page: Page, id: string) {
  const deadline = Date.now() + 20_000
  let what = await loadingIndicator(page)
  while (what && Date.now() < deadline) {
    await page.waitForTimeout(100)
    what = await loadingIndicator(page)
  }
  if (what) throw new Error(`[${id}] still loading: ${what}`)
}

async function capture(
  browser: Browser,
  baseURL: string | undefined,
  screen: Screen,
  width: Width,
  variant: Variant,
  blocked: string[],
) {
  const { id } = screen
  const context = await browser.newContext({
    baseURL,
    locale: 'en-US',
    viewport: viewports[width],
    colorScheme: variant.theme,
  })
  try {
    const page = await context.newPage()
    // A missing control fails with the screen id instead of the test timeout.
    page.setDefaultTimeout(20_000)
    await page.addInitScript((theme) => {
      try {
        localStorage.setItem('theme', theme)
      } catch {
        // storage can be blocked
      }
    }, variant.theme)
    // Only reads and the sign-in call reach the API (C-OPS-31).
    await page.route('**/api/**', async (route) => {
      const request = route.request()
      const method = request.method()
      const url = new URL(request.url())
      if (method === 'GET' || method === 'HEAD') return route.fallback()
      if (method === 'POST' && url.pathname === '/api/test/login') {
        return route.fallback()
      }
      blocked.push(`${id} ${method} ${request.url()}`)
      return route.abort()
    })
    await showLocale(page, variant.locale)

    if (screen.user) await step(id, 'sign-in', () => login(page, sven))
    await step(id, 'navigation', async () => {
      await page.goto(screen.path)
    })
    await step(id, 'prepare', () => screen.prepare(page, width))
    await step(id, 'ready check', () => screen.ready(page, width))
    if (screen.map) {
      await step(id, 'wait for map tiles', () => waitForMapLoaded(page))
    }
    await step(id, 'settle', () => settle(page))
    await noLoading(page, id)

    const file = `${id}-${width}-${variant.theme}${variant.locale === 'de' ? '-de' : ''}`
    await page.screenshot({
      fullPage: true,
      type: 'jpeg',
      quality: 80,
      path: path.join(outDir, `${file}.jpg`),
    })
    const results = await runChecks(page, {
      screen: id,
      width,
      theme: variant.theme,
      locale: variant.locale,
    }).catch(() => [])
    await writeChecks(outDir, file, results)
  } finally {
    await context.close()
  }
}

test.describe.configure({ timeout: 120_000 })

for (const screen of screens) {
  for (const width of [1280, 768, 390] as const) {
    if (!screen.widths.includes(width)) continue
    test(`${screen.id} @ ${width}`, async ({ browser, baseURL }) => {
      await mkdir(outDir, { recursive: true })
      const blocked: string[] = []
      for (const variant of variantsFor(width)) {
        await capture(browser, baseURL, screen, width, variant, blocked)
      }
      if (blocked.length > 0) {
        throw new Error(
          `Blocked requests that would write:\n${[...new Set(blocked)].join('\n')}`,
        )
      }
    })
  }
}
