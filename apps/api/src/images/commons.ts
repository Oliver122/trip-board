import {
  photoSuggestionSchema,
  webImageLimits,
  type PhotoSuggestion,
} from '@tripboard/shared'

// Wikimedia Commons client (R-34-07, R-34-09). Talks to the MediaWiki API only
// through the injected fetch, so tests never leave the machine.

export const commonsTimeoutMs = 5000
export const commonsRadiusMeters = 150
export const commonsRenditionHost = 'upload.wikimedia.org'
const geosearchLimit = 50

export class CommonsError extends Error {}

export type CommonsClient = {
  fetch: typeof fetch
  baseUrl: string
  userAgent: string
  timeoutMs?: number
}

export type CommonsFile = PhotoSuggestion & {
  /** Rendition of at most 2048 px, or the original when it is smaller. */
  renditionUrl: string
}

type ExtValue = { value?: unknown }
type ImageInfo = {
  thumburl?: string
  url?: string
  width?: number
  height?: number
  mime?: string
  descriptionurl?: string
  extmetadata?: Record<string, ExtValue | undefined>
}
type Page = { title?: string; imageinfo?: ImageInfo[] }

const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** CC0, public domain, CC BY and CC BY-SA of any version. */
export function licenseAllowed(shortName: string): boolean {
  const name = shortName.trim().toLowerCase()
  if (/^cc0(\s|$)/.test(name)) return true
  if (name === 'public domain' || name === 'pd') return true
  return /^cc[ -]by(-sa)?(\s\d(\.\d)?)?(\s[a-z-]+)?$/.test(name)
}

export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body: string) => {
      const named: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
      }
      const lower = body.toLowerCase()
      if (lower in named) return named[lower] as string
      const code = lower.startsWith('#x')
        ? Number.parseInt(lower.slice(2), 16)
        : lower.startsWith('#')
          ? Number.parseInt(lower.slice(1), 10)
          : Number.NaN
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : entity
    })
    .replace(/\s+/g, ' ')
    .trim()
}

export function pointKey(lat: number, lng: number): string {
  const round = (value: number) =>
    (Math.round(value * 1e4) / 1e4 + 0).toFixed(4)
  return `${round(lat)},${round(lng)}`
}

async function callApi(
  client: CommonsClient,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL('/w/api.php', client.baseUrl)
  for (const [key, value] of Object.entries({
    action: 'query',
    format: 'json',
    formatversion: '2',
    ...params,
  })) {
    url.searchParams.set(key, value)
  }
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    client.timeoutMs ?? commonsTimeoutMs,
  )
  try {
    const response = await client.fetch(url, {
      headers: { 'user-agent': client.userAgent, accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new CommonsError(`commons ${response.status}`)
    return await response.json()
  } catch (error) {
    if (error instanceof CommonsError) throw error
    throw new CommonsError('commons unreachable')
  } finally {
    clearTimeout(timer)
  }
}

function pagesOf(body: unknown): Page[] {
  const query = (body as { query?: { pages?: unknown } } | null)?.query
  const pages = query?.pages
  if (Array.isArray(pages)) return pages as Page[]
  if (pages && typeof pages === 'object') return Object.values(pages) as Page[]
  return []
}

function ext(info: ImageInfo, key: string): string {
  const value = info.extmetadata?.[key]?.value
  return typeof value === 'string' ? value : ''
}

function toFile(page: Page): CommonsFile | null {
  const info = page.imageinfo?.[0]
  if (!page.title || !info || !info.descriptionurl) return null
  if (!info.mime || !allowedMimes.has(info.mime)) return null
  const license = plainText(ext(info, 'LicenseShortName'))
  if (!licenseAllowed(license)) return null
  const rendition = info.thumburl ?? info.url
  if (!rendition || !info.width || !info.height) return null
  return {
    fileTitle: page.title,
    thumbUrl: rendition,
    renditionUrl: rendition,
    width: info.width,
    height: info.height,
    artist: plainText(ext(info, 'Artist')).slice(0, webImageLimits.credit),
    license: license.slice(0, webImageLimits.license),
    descriptionUrl: info.descriptionurl,
  }
}

const imageinfoParams = {
  prop: 'imageinfo',
  iiprop: 'url|size|mime|extmetadata',
}

/** Files within 150 m of the point, closest first, filtered (R-34-07). */
export async function searchCommons(
  client: CommonsClient,
  lat: number,
  lng: number,
): Promise<PhotoSuggestion[]> {
  const found = await callApi(client, {
    list: 'geosearch',
    gscoord: `${lat}|${lng}`,
    gsradius: String(commonsRadiusMeters),
    gslimit: String(geosearchLimit),
    gsnamespace: '6',
  })
  const hits =
    (found as { query?: { geosearch?: { title?: string }[] } } | null)?.query
      ?.geosearch ?? []
  const titles = hits
    .map((hit) => hit.title)
    .filter((title): title is string => typeof title === 'string')
  if (titles.length === 0) return []

  const info = await callApi(client, {
    ...imageinfoParams,
    iiurlwidth: '320',
    titles: titles.join('|'),
  })
  const byTitle = new Map(pagesOf(info).map((page) => [page.title, page]))
  const suggestions: PhotoSuggestion[] = []
  for (const title of titles) {
    const page = byTitle.get(title)
    const file = page ? toFile(page) : null
    if (!file) continue
    suggestions.push(photoSuggestionSchema.parse(file))
    if (suggestions.length === webImageLimits.suggestions) break
  }
  return suggestions
}

/** One file with a rendition of at most 2048 px (R-34-09). */
export async function lookupCommonsFile(
  client: CommonsClient,
  fileTitle: string,
): Promise<
  | { status: 'missing' }
  | { status: 'rejected' }
  | { status: 'ok'; file: CommonsFile }
> {
  const body = await callApi(client, {
    ...imageinfoParams,
    iiurlwidth: '2048',
    titles: fileTitle,
  })
  const page = pagesOf(body)[0]
  if (!page?.imageinfo?.[0]) return { status: 'missing' }
  const file = toFile(page)
  return file ? { status: 'ok', file } : { status: 'rejected' }
}
