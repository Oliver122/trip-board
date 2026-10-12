import { existsSync } from 'node:fs'
import { expect, test, type Page } from './fixtures'

// T-32-07: the selected symbol's ring is visible against the card in both themes.
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

async function createTrip(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch('/api/trips', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `Selection ${Date.now()}`,
        timezone: 'Asia/Tokyo',
        region: {
          bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 },
        },
      }),
    })
    if (!response.ok) throw new Error(await response.text())
    return ((await response.json()) as { id: string }).id
  })
}

type Rgb = [number, number, number]

function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

for (const scheme of ['light', 'dark'] as const) {
  test(`T-32-07 the selected symbol ring has 3:1 contrast against the card in ${scheme} mode @chromium`, async ({
    page,
  }, testInfo) => {
    // The Kinds section is built in parallel; wait for it to exist.
    const section = new URL(
      '../apps/web/src/kinds/KindsSection.tsx',
      import.meta.url,
    )
    for (let i = 0; i < 120 && !existsSync(section); i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.emulateMedia({ colorScheme: scheme })
    await login(page, freshDiscordId())
    const tripId = await createTrip(page)
    await page.goto(`/trips/${tripId}/settings#kinds`)
    const kinds = page.getByTestId('kinds-section')
    await expect(kinds).toBeVisible()
    await kinds
      .getByRole('button', { name: /^Color and symbol of / })
      .first()
      .click()
    const picker = kinds.getByTestId('symbol-picker').first()
    await expect(picker).toBeVisible()
    const selected = picker.locator('[role="option"][aria-selected="true"]')
    await expect(selected).toHaveCount(1)
    await expect(selected.getByTestId('selected-check')).toHaveCount(1)

    const result = await selected.evaluate((el) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      const toRgb = (css: string): [number, number, number] => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = '#000'
        ctx.fillStyle = css
        ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        return [d[0]!, d[1]!, d[2]!]
      }
      const style = getComputedStyle(el)
      const ring = style.getPropertyValue('--tw-ring-color').trim()
      const shadow = style.boxShadow
      let card: Element | null = el.parentElement
      while (card) {
        const bg = getComputedStyle(card).backgroundColor
        if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break
        card = card.parentElement
      }
      const cardBg = card ? getComputedStyle(card).backgroundColor : '#fff'
      return {
        ring: toRgb(ring),
        card: toRgb(cardBg),
        ringCss: ring,
        shadow,
      }
    })
    expect(result.shadow, 'ring is drawn as a box-shadow').not.toBe('none')
    expect(
      contrast(result.ring, result.card),
      `${scheme}: ring ${result.ringCss} on card`,
    ).toBeGreaterThanOrEqual(3)

    await picker.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath(`kind-selection-${scheme}.png`),
    })
    await picker.screenshot({
      path: `test-results/kind-selection-${scheme}.png`,
    })
  })
}
