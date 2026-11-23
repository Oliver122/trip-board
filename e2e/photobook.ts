import { fileURLToPath } from 'node:url'
import { expect, type Browser, type Page } from './fixtures'

export const sven = '100000000000000001'
export const aiko = '100000000000000002'
export const tom = '100000000000000003'

export const japan = '10000000-0000-0000-0000-000000000001'
export const photosUrl = `/trips/${japan}/photos`

// The seed contract of R-47-12 (`seedIds.photos`).
export const photo = {
  crossing: '50000000-0000-0000-0000-000000000001',
  alley: '50000000-0000-0000-0000-000000000002',
  kamo: '50000000-0000-0000-0000-000000000003',
  unplaced: '50000000-0000-0000-0000-000000000004',
}
export const shibuyaSky = '20000000-0000-0000-0000-000000000001'
export const kamoPoint = { lng: 135.7681, lat: 35.0116 }

const fixtures = fileURLToPath(
  new URL('../apps/web/src/photobook/fixtures', import.meta.url),
)
export const fixture = (name: string) => `${fixtures}/${name}`

export async function login(page: Page, discordId: string) {
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

export async function setLocale(page: Page, locale: 'en' | 'de') {
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

export function mapCentre(page: Page) {
  return page.evaluate(() => {
    const map = (
      window as unknown as {
        __tripboardMap?: { getCenter: () => { lng: number; lat: number } }
      }
    ).__tripboardMap
    const center = map?.getCenter()
    return { lng: center?.lng ?? 0, lat: center?.lat ?? 0 }
  })
}

/** Zooms the map onto a point, so a marker is not folded into a cluster. */
export function jumpTo(page: Page, lng: number, lat: number, zoom = 15) {
  return page.evaluate(
    ({ lng: x, lat: y, zoom: z }) => {
      const map = (
        window as unknown as {
          __tripboardMap?: {
            jumpTo: (o: { center: [number, number]; zoom: number }) => void
          }
        }
      ).__tripboardMap
      map?.jumpTo({ center: [x, y], zoom: z })
    },
    { lng, lat, zoom },
  )
}

/** The photo list of the trip as the API sends it. */
export async function photoList(page: Page, tripId = japan) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/trips/${id}/photos`, {
      credentials: 'include',
    })
    if (!response.ok) throw new Error(await response.text())
    return (await response.json()) as {
      photos: {
        id: string
        lat: number | null
        lng: number | null
        spotId: string | null
        caption: string | null
        takenAt: string | null
      }[]
    }
  }, tripId)
}

/** A trip of the signed-in user, deleted by {@link deleteTrip}. */
export async function createTrip(page: Page, name: string) {
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

export async function deleteTrip(page: Page, tripId: string) {
  await page.evaluate(async (id) => {
    await fetch(`/api/trips/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
  }, tripId)
}

/** Uploads a photo through the API (no GPS, no date) and returns its id. */
async function uploadPhoto(
  page: Page,
  tripId: string,
  fields: Record<string, string> = {},
) {
  return page.evaluate(
    async ({ id, extra }) => {
      const bytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        ),
        (char) => char.charCodeAt(0),
      )
      const body = new FormData()
      for (const [key, value] of Object.entries(extra)) body.append(key, value)
      body.append('file', new File([bytes], 'p.png', { type: 'image/png' }))
      const response = await fetch(`/api/trips/${id}/photos`, {
        method: 'POST',
        credentials: 'include',
        body,
      })
      if (!response.ok) throw new Error(await response.text())
      return ((await response.json()) as { id: string }).id
    },
    { id: tripId, extra: fields },
  )
}

/** Tags the map and its canvas, so {@link sameMap} can tell a remount. */
export async function tagMap(page: Page) {
  await page.evaluate(() => {
    const map = (window as unknown as { __tripboardMap?: object })
      .__tripboardMap as { __probe?: number } | undefined
    const canvas = document.querySelector('canvas.maplibregl-canvas')
    if (!map || !canvas) throw new Error('map missing')
    map.__probe = 1
    ;(window as unknown as { __mapCanvas?: Element }).__mapCanvas = canvas
  })
}

export function sameMap(page: Page) {
  return page.evaluate(() => {
    const map = (window as unknown as { __tripboardMap?: { __probe?: number } })
      .__tripboardMap
    const canvas = document.querySelector('canvas.maplibregl-canvas')
    const tagged = (window as unknown as { __mapCanvas?: Element }).__mapCanvas
    return map?.__probe === 1 && canvas != null && canvas === tagged
  })
}

/** Opens the Photobook tab of Japan 2026 and waits until the seed book shows. */
export async function openBook(page: Page) {
  await page.goto(photosUrl)
  await expect(page.getByTestId('photobook')).toBeVisible()
  await expect(page.getByTestId(`book-photo-${photo.crossing}`)).toBeVisible()
}

/**
 * A spare photo in Japan 2026 uploaded by sven. aiko's photo quota is often
 * used up by other specs on the shared database.
 */
export async function uploadSpare(browser: Browser) {
  const page = await browser.newPage()
  try {
    await login(page, sven)
    return await uploadPhoto(page, japan)
  } finally {
    await page.close()
  }
}
