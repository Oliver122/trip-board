import type { Page } from '@playwright/test'

const failures = new WeakMap<Page, string>()

export function watchWebgl(page: Page) {
  page.on('console', (message) => {
    const text = message.text()
    if (text.includes('Failed to create WebGL context')) {
      failures.set(page, text)
    }
  })
}

type Box = { minLng: number; minLat: number; maxLng: number; maxLat: number }

export function waitForMap(page: Page) {
  return waitFor(page, () => {
    const map = (
      window as unknown as {
        __tripboardMap?: { getCenter: () => { lng: number; lat: number } }
      }
    ).__tripboardMap
    if (!map) return false
    const center = map.getCenter()
    return Number.isFinite(center.lng) && Number.isFinite(center.lat)
  })
}

export function waitForMapLoaded(page: Page) {
  return waitFor(page, () => {
    const map = (
      window as unknown as {
        __tripboardMap?: { loaded: () => boolean }
      }
    ).__tripboardMap
    return Boolean(map?.loaded())
  })
}

export function waitForJapan(page: Page, box: Box) {
  return waitFor(
    page,
    (bounds) => {
      const map = (
        window as unknown as {
          __tripboardMap?: { getCenter: () => { lng: number; lat: number } }
        }
      ).__tripboardMap
      if (!map) return false
      const center = map.getCenter()
      return (
        center.lng > bounds.minLng &&
        center.lng < bounds.maxLng &&
        center.lat > bounds.minLat &&
        center.lat < bounds.maxLat
      )
    },
    box,
  )
}

async function waitFor(page: Page, check: (arg: Box) => boolean, arg?: Box) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    failIfNoWebgl(page)
    const ready = await page
      .evaluate(check, arg ?? { minLng: 0, minLat: 0, maxLng: 0, maxLat: 0 })
      .catch(() => false)
    if (ready) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  failIfNoWebgl(page)
  throw new Error('Timed out waiting for the map')
}

function failIfNoWebgl(page: Page) {
  const cause = failures.get(page)
  if (!cause) return
  throw new Error(`MapLibre failed to create a WebGL context: ${cause}`)
}
