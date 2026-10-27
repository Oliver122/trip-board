// Wikipedia and Commons links in from-url (R-43-10, R-43-11).

const renditionWidth = 2048
const uploadHost = 'upload.wikimedia.org'
const originalName = /\.(?:jpe?g|png|webp)$/i
const thumbName = /^(\d+)px-(.+)$/

/**
 * R-43-10: the 2048 px rendition to download instead of a Wikimedia original
 * (`.jpg`, `.jpeg`, `.png`, `.webp`, any case) or of a thumb wider than
 * 2048 px; null when the URL is fetched as it is.
 */
export function wikimediaRendition(url: URL): URL | null {
  if (url.hostname !== uploadHost) return null
  // Work on the raw path: percent-encoded names stay byte for byte.
  const parts = url.pathname.split('/')
  // ['', 'wikipedia', project, h1, h2, name]
  if (parts[1] !== 'wikipedia' || !parts[2]) return null

  if (parts.length === 6 && parts[3] !== 'thumb') {
    const [, , project, h1, h2, name] = parts
    if (!h1 || !h2 || !name || !originalName.test(name)) return null
    return withPath(
      url,
      `/wikipedia/${project}/thumb/${h1}/${h2}/${name}/${renditionWidth}px-${name}`,
    )
  }

  // ['', 'wikipedia', project, 'thumb', h1, h2, name, 'Npx-name']
  if (parts.length === 8 && parts[3] === 'thumb') {
    const match = thumbName.exec(parts[7] ?? '')
    if (!match || Number(match[1]) <= renditionWidth) return null
    const head = parts.slice(0, 7).join('/')
    return withPath(url, `${head}/${renditionWidth}px-${match[2]}`)
  }
  return null
}

function withPath(url: URL, pathname: string): URL {
  const next = new URL(url)
  next.pathname = pathname
  return next
}

const filePrefix = /^(?:File|Datei):/i

/**
 * R-43-11: a `File:` / `Datei:` description page on Commons or Wikipedia
 * (also `#/media/File:` fragments) as a Commons file title with spaces,
 * percent-decoded; null for every other URL.
 */
export function wikimediaFileTitle(url: URL): { fileTitle: string } | null {
  if (!isPageHost(url.hostname)) return null
  if (!url.pathname.startsWith('/wiki/')) return null

  const fragment = url.hash.startsWith('#/media/') ? url.hash.slice(8) : null
  const raw =
    fragment !== null && filePrefix.test(safeDecode(fragment) ?? '')
      ? fragment
      : url.pathname.slice('/wiki/'.length)
  const decoded = safeDecode(raw)
  if (decoded === null || !filePrefix.test(decoded)) return null
  const name = decoded.replace(filePrefix, '').replaceAll('_', ' ').trim()
  if (!name) return null
  return { fileTitle: `File:${name}` }
}

function isPageHost(host: string): boolean {
  if (host === 'commons.wikimedia.org') return true
  return /^[a-z][a-z-]*(?:\.m)?\.wikipedia\.org$/i.test(host)
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}
