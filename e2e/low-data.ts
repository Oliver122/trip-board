import type { Page } from '@playwright/test'

export const planner = '100000000000000002'
export const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
).toString('base64')

/** A new numeric Discord id per call, so a test has its own photo quota and upload limit. */
export function freshUser() {
  return `9${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`
}

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

const created = new WeakMap<Page, string[]>()

/** Deletes the trips made by {@link tripWithPhotos}, which frees the planner's photo quota. */
export async function deleteCreatedTrips(page: Page) {
  const ids = created.get(page) ?? []
  created.delete(page)
  if (ids.length === 0) return
  await page.evaluate(async (list) => {
    for (const id of list) {
      await fetch(`/api/trips/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
    }
  }, ids)
}

/** A trip with "Kinkaku-ji" and three uploaded photos. Returns the trip and spot ids. */
export async function tripWithPhotos(page: Page, name: string, photos = 3) {
  const made = await page.evaluate(
    async ({ name: tripName, photos: count, file }) => {
      const json = { 'content-type': 'application/json' }
      const trip = (await (
        await fetch('/api/trips', {
          method: 'POST',
          credentials: 'include',
          headers: json,
          body: JSON.stringify({
            name: tripName,
            timezone: 'Asia/Tokyo',
            region: {
              bbox: { minLng: 135, minLat: 34, maxLng: 140, maxLat: 36 },
            },
          }),
        })
      ).json()) as { id: string }
      const spot = (await (
        await fetch(`/api/trips/${trip.id}/spots`, {
          method: 'POST',
          credentials: 'include',
          headers: json,
          body: JSON.stringify({
            title: 'Kinkaku-ji',
            lat: 35.0394,
            lng: 135.7292,
            baseCategory: 'maybe',
          }),
        })
      ).json()) as { id: string }
      for (let index = 0; index < count; index += 1) {
        const bytes = Uint8Array.from(atob(file), (char) => char.charCodeAt(0))
        const body = new FormData()
        body.append(
          'file',
          new File([bytes], `photo-${index}.png`, { type: 'image/png' }),
        )
        const response = await fetch(`/api/spots/${spot.id}/images`, {
          method: 'POST',
          credentials: 'include',
          body,
        })
        if (!response.ok) throw new Error(await response.text())
      }
      return { tripId: trip.id, spotId: spot.id }
    },
    { name, photos, file: png },
  )
  created.set(page, [...(created.get(page) ?? []), made.tripId])
  return made
}

/** Requests the low-data mode must not make (R-38-07..R-38-10). */
export const heavyRequest =
  /tiles\.openfreemap\.org|\/textures\/kind-symbols\.png|\/images\/[^/]+\/file|signature=|commons\.wikimedia|upload\.wikimedia|photo-suggestions|cdn\.discordapp\.com|\/src\/map\/TripMap|maplibre/

export function recordRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => urls.push(request.url()))
  return urls
}

/** Gives every member in trip responses an avatar URL on Discord's host. */
export async function fakeAvatars(page: Page) {
  await page.route('https://cdn.discordapp.com/**', (route) => route.abort())
  const patch = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(patch)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, inner]) => [
          key,
          key === 'avatarUrl'
            ? 'https://cdn.discordapp.com/avatars/1/a.png'
            : patch(inner),
        ]),
      )
    }
    return value
  }
  await page.route(
    /\/api\/trips(\/[^/?]+(\/members)?)?(\?.*)?$/,
    async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const response = await route.fetch()
      if (!response.ok()) return route.fulfill({ response })
      await route.fulfill({ response, json: patch(await response.json()) })
    },
  )
}
