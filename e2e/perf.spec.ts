import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, expect, test } from '@playwright/test'
import { launch } from 'chrome-launcher'
import lighthouse, { desktopConfig } from 'lighthouse'

const japanTrip = '/trips/10000000-0000-0000-0000-000000000001'
const previewPort = 5192

test(
  'T-15-07 lighthouse desktop performance on the seeded board',
  { tag: '@chromium' },
  async ({ baseURL }) => {
    test.setTimeout(180_000)
    if (!baseURL) throw new Error('baseURL missing')
    const previewUrl = await startPreview()
    try {
      const login = await fetch(`${baseURL}/api/test/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: baseURL,
        },
        body: JSON.stringify({ discordId: '100000000000000001' }),
      })
      expect(login.ok).toBe(true)
      const session = (login.headers.get('set-cookie') ?? '')
        .split(',')
        .map((part) => part.split(';')[0]?.trim() ?? '')
        .find((part) => part.startsWith('tb_session='))
      expect(session).toBeTruthy()

      const chrome = await launch({
        chromePath: chromium.executablePath(),
        chromeFlags: [
          '--headless=new',
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ],
      })
      try {
        const result = await lighthouse(
          `${previewUrl}${japanTrip}`,
          {
            port: chrome.port,
            output: 'json',
            onlyCategories: ['performance'],
            extraHeaders: { Cookie: session ?? '' },
            logLevel: 'error',
          },
          desktopConfig,
        )
        const score = result?.lhr.categories.performance.score ?? 0
        const lcp = result?.lhr.audits['largest-contentful-paint']?.displayValue
        const tbt = result?.lhr.audits['total-blocking-time']?.displayValue
        expect(
          score,
          `final ${result?.lhr.finalDisplayedUrl} LCP ${lcp} TBT ${tbt}`,
        ).toBeGreaterThanOrEqual(0.85)
      } finally {
        await chrome.kill()
      }
    } finally {
      stopPreview()
    }
  },
)

let preview: ReturnType<typeof spawn> | undefined

async function startPreview(): Promise<string> {
  const index = new URL('../apps/web/dist/index.html', import.meta.url)
  if (!existsSync(index)) {
    throw new Error('run `pnpm build` first')
  }
  const url = `http://127.0.0.1:${previewPort}`
  preview = spawn(
    new URL('../apps/web/node_modules/.bin/vite', import.meta.url).pathname,
    [
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(previewPort),
      '--strictPort',
    ],
    {
      cwd: new URL('../apps/web', import.meta.url).pathname,
      env: process.env,
      stdio: 'ignore',
    },
  )
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.status === 200) return url
    } catch {
      // Preview is still starting.
    }
    await delay(200)
  }
  stopPreview()
  throw new Error('Production preview did not start')
}

function stopPreview() {
  preview?.kill()
  preview = undefined
}
