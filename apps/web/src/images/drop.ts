// Reads what was dropped or pasted into a gallery (R-34-02). Pure, so the unit
// test needs no browser events.

export type Dropped =
  | { kind: 'files'; files: File[] }
  | { kind: 'url'; url: string }
  | { kind: 'none' }

/** The part of DataTransfer / clipboardData the parser reads. */
export type TransferLike = {
  files: ArrayLike<File>
  getData: (type: string) => string
}

export function parseTransfer(transfer: TransferLike): Dropped {
  const files = Array.from(transfer.files)
  if (files.length > 0) return { kind: 'files', files }
  const candidates = [
    imageSrcOf(transfer.getData('text/html')),
    firstUriOf(transfer.getData('text/uri-list')),
    transfer.getData('text/plain').trim(),
  ]
  for (const candidate of candidates) {
    const found = candidate ? fromText(candidate) : null
    if (found) return found
  }
  return { kind: 'none' }
}

function fromText(text: string): Dropped | null {
  if (/^data:image\//i.test(text)) {
    const file = fileFromDataUri(text)
    return file ? { kind: 'files', files: [file] } : null
  }
  if (!/^https?:\/\//i.test(text) || /\s/.test(text)) return null
  try {
    return { kind: 'url', url: unwrapImgres(new URL(text)).href }
  } catch {
    return null
  }
}

function firstUriOf(list: string): string {
  const line = list
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry !== '' && !entry.startsWith('#'))
  return line ?? ''
}

function imageSrcOf(html: string): string {
  if (html === '') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.querySelector('img')?.getAttribute('src')?.trim() ?? ''
}

/** A Google `…/imgres?imgurl=<x>` link stands for the image at `<x>`. */
function unwrapImgres(url: URL): URL {
  if (!/(^|\.)google\.[a-z.]+$/i.test(url.hostname)) return url
  if (url.pathname !== '/imgres') return url
  const target = url.searchParams.get('imgurl')
  if (!target) return url
  try {
    const inner = new URL(target)
    return inner.protocol === 'http:' || inner.protocol === 'https:'
      ? inner
      : url
  } catch {
    return url
  }
}

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
}

export function fileFromDataUri(uri: string): File | null {
  const match = /^data:(image\/[a-z0-9.+-]+)((?:;[^,;]*)*),(.*)$/is.exec(uri)
  if (!match) return null
  const [, type, params, data] = match
  const mime = type.toLowerCase()
  try {
    const bytes = /;base64/i.test(params)
      ? Uint8Array.from(atob(decodeURIComponent(data)), (char) =>
          char.charCodeAt(0),
        )
      : new TextEncoder().encode(decodeURIComponent(data))
    return new File([bytes], `image.${extensions[mime] ?? 'img'}`, {
      type: mime,
    })
  } catch {
    return null
  }
}
